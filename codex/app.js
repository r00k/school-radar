(function () {
  const model = window.AIR_PURIFIER_MODEL;
  if (!model) {
    return;
  }

  const { assumptions: a, controls, profile } = model;

  const studentsRange = document.getElementById("studentsRange");
  const studentsInput = document.getElementById("studentsInput");
  const countdownEl = document.getElementById("countdown");
  const countdownNoteEl = document.getElementById("countdownNote");
  const assumptionsTable = document.getElementById("assumptionsTable");
  const sourcesList = document.getElementById("sourcesList");
  const headline = document.getElementById("headline");
  const subhead = document.getElementById("subhead");

  let countdownSeconds = 0;
  let cycleSeconds = 0;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function toInt(value) {
    return Math.round(value);
  }

  function fmtInt(value) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
  }

  function fmtPct(value, digits = 1) {
    return `${(value * 100).toFixed(digits)}%`;
  }

  function fmtHours(value) {
    return `${fmtInt(value)} hours`;
  }

  function fmtTime(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;

    if (h > 0) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function erf(x) {
    const sign = x >= 0 ? 1 : -1;
    const absX = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * absX);
    const y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
        t *
        Math.exp(-absX * absX);
    return sign * y;
  }

  function normalCdf(x) {
    return 0.5 * (1 + erf(x / Math.sqrt(2)));
  }

  function animateText(el, value, formatter) {
    if (!el) {
      return;
    }
    const next = Number(value);
    if (!Number.isFinite(next)) {
      el.textContent = String(value);
      return;
    }

    const prev = Number(el.dataset.prev ?? next);
    const start = performance.now();
    const duration = 420;

    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = prev + (next - prev) * eased;
      el.textContent = formatter(current);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = formatter(next);
        el.dataset.prev = String(next);
      }
    }

    requestAnimationFrame(tick);
  }

  function compute(students) {
    const teachers = students / a.studentTeacherRatio;

    const studentAbsencesNo = students * a.schoolDaysPerYear * (1 - a.studentAttendanceRate);
    const studentAbsencesYes = studentAbsencesNo * (1 - a.purifierStudentAbsenceReductionPct);
    const studentAbsencesAvoided = studentAbsencesNo - studentAbsencesYes;

    const teacherIllnessNo = teachers * a.baselineTeacherSickDaysPerYear;

    const pmDropUg = a.assumedBaselinePm25UgM3 * a.purifierPm25ReductionPct;
    const teacherIllnessReductionPct = clamp(
      a.teacherIllnessAbsenceIncreasePer10UgPm25 * (pmDropUg / 10),
      0,
      0.6,
    );
    const teacherIllnessYes = teacherIllnessNo * (1 - teacherIllnessReductionPct);
    const teacherIllnessAvoided = teacherIllnessNo - teacherIllnessYes;

    const behaviorPressureNo = 100;
    const behaviorReductionPct = clamp(a.behaviorReferralIncreasePer10UgPm25 * (pmDropUg / 10), 0, 0.7);
    const behaviorPressureYes = behaviorPressureNo * (1 - behaviorReductionPct);

    const noInstructionHoursLost = studentAbsencesNo * a.schoolDayHours;
    const yesInstructionHoursRecovered = studentAbsencesAvoided * a.schoolDayHours;

    const percentileGain = (normalCdf(a.sameDayTestScoreGainZ) - 0.5) * 100;

    const asthmaStudents = students * a.childAsthmaPrevalenceRate;
    const healthChronicStudents = students * a.healthRelatedChronicAbsenceRate;

    const avoidableAbsencesPerDay = studentAbsencesAvoided / a.schoolDaysPerYear;

    return {
      teachers,
      studentAbsencesNo,
      studentAbsencesYes,
      studentAbsencesAvoided,
      teacherIllnessNo,
      teacherIllnessYes,
      teacherIllnessAvoided,
      teacherIllnessReductionPct,
      behaviorPressureNo,
      behaviorPressureYes,
      behaviorReductionPct,
      noInstructionHoursLost,
      yesInstructionHoursRecovered,
      percentileGain,
      asthmaStudents,
      healthChronicStudents,
      avoidableAbsencesPerDay,
    };
  }

  function setTextBySelector(key, text) {
    const el = document.querySelector(`[data-value="${key}"]`);
    if (el) {
      el.textContent = text;
    }
  }

  function renderAssumptions() {
    assumptionsTable.innerHTML = "";
    model.assumptionRows.forEach((row) => {
      const div = document.createElement("div");
      div.className = "assumption-row";
      div.innerHTML = `
        <strong>${row.label}</strong>
        <span>${row.value}</span>
        <span>Source ${row.source} · ${row.confidence} confidence</span>
      `;
      assumptionsTable.appendChild(div);
    });

    model.modelNotes.forEach((note) => {
      const noteRow = document.createElement("div");
      noteRow.className = "assumption-row";
      noteRow.innerHTML = `<strong>Model note</strong><span>${note}</span><span></span>`;
      assumptionsTable.appendChild(noteRow);
    });
  }

  function renderSources() {
    sourcesList.innerHTML = "";
    model.sources.forEach((source) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${source.id}</strong> · <a href="${source.url}" target="_blank" rel="noreferrer">${source.title}</a> (${source.publisher}, ${source.year}). ${source.whyItMatters}`;
      sourcesList.appendChild(li);
    });
  }

  function configureHeader() {
    headline.textContent = `How quickly cleaner classroom air changes outcomes at ${profile.schoolName}`;
    subhead.textContent = `Prepared for ${profile.adminName}, ${profile.role}. This version compares current conditions vs. district-wide classroom purification using research-backed, editable assumptions.`;
  }

  function render(students) {
    const m = compute(students);

    animateText(document.querySelector('[data-value="noStudentAbsences"]'), m.studentAbsencesNo, fmtInt);
    animateText(document.querySelector('[data-value="yesStudentAbsences"]'), m.studentAbsencesYes, fmtInt);
    setTextBySelector(
      "deltaStudentAbsences",
      `${fmtInt(m.studentAbsencesAvoided)} fewer days/year (${fmtPct(a.purifierStudentAbsenceReductionPct)})`,
    );

    animateText(document.querySelector('[data-value="noTeacherIllness"]'), m.teacherIllnessNo, fmtInt);
    animateText(document.querySelector('[data-value="yesTeacherIllness"]'), m.teacherIllnessYes, fmtInt);
    setTextBySelector(
      "deltaTeacherIllness",
      `${fmtInt(m.teacherIllnessAvoided)} fewer days/year (modeled ${fmtPct(m.teacherIllnessReductionPct)})`,
    );

    animateText(document.querySelector('[data-value="noInstructionHoursLost"]'), m.noInstructionHoursLost, (v) => fmtHours(v));
    animateText(
      document.querySelector('[data-value="yesInstructionHoursRecovered"]'),
      m.yesInstructionHoursRecovered,
      (v) => fmtHours(v),
    );
    setTextBySelector(
      "deltaInstructionHoursRecovered",
      `${fmtInt(m.studentAbsencesAvoided)} student-days returned to classrooms`,
    );

    animateText(document.querySelector('[data-value="noBehaviorIndex"]'), m.behaviorPressureNo, (v) => `${v.toFixed(1)} index`);
    animateText(document.querySelector('[data-value="yesBehaviorIndex"]'), m.behaviorPressureYes, (v) => `${v.toFixed(1)} index`);
    setTextBySelector("deltaBehaviorIndex", `${fmtPct(m.behaviorReductionPct)} lower modeled discipline pressure`);

    setTextBySelector(
      "testScoreGain",
      `+${a.sameDayTestScoreGainZ.toFixed(2)} SD (about +${m.percentileGain.toFixed(1)} percentile points)`,
    );

    const scoreNarrative = document.getElementById("testScoreNarrative");
    if (scoreNarrative) {
      scoreNarrative.textContent = `Randomized purifier testing found measurable same-day score gains. This should be treated as directional evidence for K-12 classrooms.`;
    }

    setTextBySelector(
      "asthmaStudents",
      `${fmtInt(m.asthmaStudents)} students may have asthma-related vulnerability to particulate exposure (national-rate estimate).`,
    );
    setTextBySelector(
      "healthChronicStudents",
      `${fmtInt(m.healthChronicStudents)} students may face health-related chronic absenteeism risk without better baseline indoor air quality.`,
    );
    setTextBySelector(
      "subCoverageDays",
      `${fmtInt(m.teacherIllnessAvoided)} fewer teacher illness-absence days can reduce substitute coverage disruption.`,
    );
    setTextBySelector(
      "learningDaysSaved",
      `${fmtInt(m.studentAbsencesAvoided)} student learning days/year protected in the filtration scenario.`,
    );

    const cycle = clamp((a.schoolDayHours * 3600) / Math.max(m.avoidableAbsencesPerDay, 0.01), 5, 12 * 3600);
    cycleSeconds = cycle;
    countdownSeconds = cycleSeconds;

    countdownNoteEl.textContent = `At this enrollment, the model expects roughly ${m.avoidableAbsencesPerDay.toFixed(
      1,
    )} preventable absence-days every school day.`;
  }

  function pushStudentValue(raw) {
    const next = clamp(toInt(Number(raw) || controls.defaultStudents), controls.minStudents, controls.maxStudents);
    studentsRange.value = String(next);
    studentsInput.value = String(next);
    render(next);
  }

  function initControls() {
    studentsRange.min = String(controls.minStudents);
    studentsRange.max = String(controls.maxStudents);
    studentsRange.step = String(controls.step);

    studentsInput.min = String(controls.minStudents);
    studentsInput.max = String(controls.maxStudents);
    studentsInput.step = String(controls.step);

    studentsRange.addEventListener("input", (event) => {
      pushStudentValue(event.target.value);
    });

    studentsInput.addEventListener("change", (event) => {
      pushStudentValue(event.target.value);
    });

    studentsInput.addEventListener("keyup", (event) => {
      if (event.key === "Enter") {
        pushStudentValue(event.target.value);
      }
    });

    pushStudentValue(controls.defaultStudents);
  }

  function startCountdown() {
    setInterval(() => {
      if (countdownSeconds <= 0) {
        countdownSeconds = cycleSeconds;
      }
      countdownEl.textContent = fmtTime(countdownSeconds);
      countdownSeconds -= 1;
    }, 1000);
  }

  configureHeader();
  renderAssumptions();
  renderSources();
  initControls();
  startCountdown();
})();
