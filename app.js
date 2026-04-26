const fields = {
  principal: {
    input: document.getElementById("principalInput"),
    range: document.getElementById("principalRange"),
    card: document.querySelector('[data-key="principal"].control-card'),
    min: 0,
    max: 100000000000000,
    sliderMax: 20000000,
    step: 10000
  },
  annualRate: {
    input: document.getElementById("annualRateInput"),
    range: document.getElementById("annualRateRange"),
    card: document.querySelector('[data-key="annualRate"].control-card'),
    min: 0,
    max: 500,
    sliderMax: 30,
    step: 0.05
  },
  durationMonths: {
    input: document.getElementById("durationYearsInput"),
    monthInput: document.getElementById("durationMonthInput"),
    range: document.getElementById("durationRange"),
    card: document.querySelector('[data-key="durationMonths"].control-card'),
    min: 1,
    max: 6000,
    sliderMax: 480,
    step: 1
  },
  monthlyEmi: {
    input: document.getElementById("monthlyEmiInput"),
    range: document.getElementById("monthlyEmiRange"),
    card: document.querySelector('[data-key="monthlyEmi"].control-card'),
    min: 0,
    max: 100000000000000,
    sliderMax: 500000,
    step: 100
  },
  totalInterest: {
    input: document.getElementById("totalInterestInput"),
    range: document.getElementById("totalInterestRange"),
    card: document.querySelector('[data-key="totalInterest"].control-card'),
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    step: 1000
  },
  totalPaid: {
    input: document.getElementById("totalPaidInput"),
    range: document.getElementById("totalPaidRange"),
    card: document.querySelector('[data-key="totalPaid"].control-card'),
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    step: 1000
  }
};

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

const state = {
  principal: 2500000,
  annualRate: 8.5,
  durationMonths: 240,
  borrowedDate: todayIso(),
  currentDate: todayIso(),
  hasHoliday: false,
  moratoriumMonths: 0,
  holidayMode: "capitalize",
  holidayPrincipalMonthly: 0,
  desiredClosureDate: "",
  monthlyEmi: 0,
  totalInterest: 0,
  totalPaid: 0
};

const amountKeys = new Set(["principal", "monthlyEmi", "totalInterest", "totalPaid"]);
const adjustableKeys = ["principal", "annualRate", "durationMonths", "monthlyEmi"];
const calculatedKeys = new Set(["totalInterest", "totalPaid"]);

const touched = {
  principal: 1,
  annualRate: 2,
  durationMonths: 3,
  monthlyEmi: 4,
  totalInterest: 5,
  totalPaid: 6
};

const manual = {
  principal: true,
  annualRate: true,
  durationMonths: true,
  monthlyEmi: false,
  totalInterest: false,
  totalPaid: false
};

let autoKey = "monthlyEmi";
let clock = 10;
let isRendering = false;

const solveStatus = document.getElementById("solveStatus");
const durationBadge = document.getElementById("durationBadge");
const mixCanvas = document.getElementById("mixChart");
const timelineCanvas = document.getElementById("timelineChart");
const chartTooltip = document.getElementById("chartTooltip");
const runwayLabel = document.getElementById("runwayLabel");
const emiCapLabel = document.getElementById("emiCapLabel");
const toast = document.getElementById("toast");
const repaymentChart = document.getElementById("repaymentChart");
const closureChart = document.getElementById("closureChart");

const calendarControls = {
  borrowedDate: document.getElementById("borrowedDateInput"),
  currentDate: document.getElementById("currentDateInput"),
  hasHoliday: document.getElementById("hasHolidayInput"),
  moratoriumRange: document.getElementById("moratoriumRange"),
  moratoriumYears: document.getElementById("moratoriumYearsInput"),
  moratoriumMonths: document.getElementById("moratoriumMonthInput"),
  holidayMode: document.getElementById("holidayModeInput"),
  holidayPrincipalRange: document.getElementById("holidayPrincipalRange"),
  holidayPrincipalInput: document.getElementById("holidayPrincipalInput"),
  holidayPrincipalCap: document.getElementById("holidayPrincipalCap"),
  postHolidayPrincipalRange: document.getElementById("postHolidayPrincipalRange"),
  postHolidayPrincipalInput: document.getElementById("postHolidayPrincipalInput"),
  card: document.querySelector('[data-key="loanCalendar"].control-card')
};

const repaymentInputs = {
  remainingPrincipal: {
    input: document.getElementById("repayRemainingPrincipalInput"),
    range: document.getElementById("repayRemainingPrincipalRange"),
    cap: document.getElementById("repayRemainingCap")
  },
  maturityDate: {
    input: document.getElementById("repayMaturityDateInput")
  },
  prepayment: {
    input: document.getElementById("prepaymentInput"),
    range: document.getElementById("prepaymentRange"),
    cap: document.getElementById("prepayCap")
  },
  desiredClosureDate: {
    input: document.getElementById("desiredClosureDateInput")
  }
};

let hoverMonthIndex = null;
let toastTimer = 0;
let pendingNotice = "";

const repaymentState = {
  remainingPrincipal: 0,
  maturityDate: "",
  prepayment: 0,
  manualRemaining: false,
  manualMaturity: false
};

const moneyFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const percentFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric"
});

function money(value) {
  return `Rs ${formatAmount(value)}`;
}

function formatAmount(value) {
  return moneyFormatter.format(safeNumber(value));
}

function compactMoney(value) {
  const number = safeNumber(value);
  if (number >= 100000000000) return `Rs ${(number / 10000000).toLocaleString("en-IN", { maximumFractionDigits: 0 })}Cr`;
  if (number >= 10000000) return `Rs ${(number / 10000000).toFixed(2)}Cr`;
  if (number >= 100000) return `Rs ${(number / 100000).toFixed(2)}L`;
  if (number >= 1000) return `Rs ${(number / 1000).toFixed(1)}K`;
  return money(number);
}

function parseAmount(value) {
  if (typeof value === "number") return value;
  return safeNumber(String(value).replace(/[^0-9.-]/g, ""));
}

function parseDecimal(value) {
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "." || cleaned === "-" || cleaned === "-.") {
    return null;
  }
  return safeNumber(cleaned, null);
}

function percent(value) {
  return `${percentFormatter.format(safeNumber(value))}%`;
}

function todayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value) {
  const parts = String(value || "").split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return parseIsoDate(todayIso());
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function addMonthsToIso(value, months) {
  const date = parseIsoDate(value);
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + Math.round(safeNumber(months)), 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

function isoFromDate(date) {
  const value = date instanceof Date ? date : parseIsoDate(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  return dateFormatter.format(value instanceof Date ? value : parseIsoDate(value));
}

function monthsBetween(startIso, endIso) {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundUpToStep(value, step) {
  if (value <= 0) return 0;
  return Math.ceil(value / step) * step;
}

function roundDownToStep(value, step) {
  if (value <= 0) return 0;
  return Math.floor(value / step) * step;
}

function queueNotice(message, key) {
  pendingNotice = message;
  if (key && fields[key]) {
    fields[key].card.classList.remove("limit-hit");
    void fields[key].card.offsetWidth;
    fields[key].card.classList.add("limit-hit");
  }
}

function showNotice(message) {
  if (!message || !toast) return;
  toast.textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => {
      toast.hidden = true;
    }, 220);
  }, 3600);
}

const parameterNotes = {
  principalInput: "Loan Amount: the money originally borrowed. Slider has a practical cap; typed value can go up to the dashboard maximum.",
  annualRateInput: "Interest Yearly: annual reducing-balance rate. Monthly rate is annual rate divided by 12.",
  durationRange: "Duration: EMI repayment period after any holiday period. Total loan timeline equals holiday period plus this repayment duration.",
  monthlyEmiInput: "Monthly EMI: fixed monthly installment after holiday. The final month can be lower if the balance closes before a full EMI.",
  borrowedDateInput: "Borrowed Date: loan disbursement date. Payment start and maturity dates are calculated from this date.",
  currentDateInput: "Current Date: as-of date used in repayment and close-early strategy calculations.",
  totalInterestInput: "Total Interest: calculated from the full amortization schedule, including holiday interest if unpaid.",
  totalPaidInput: "Total Amount Paid: total cash paid across holiday payments and EMI repayments.",
  repayTotalPaidInput: "Total Amount Paid So Far: actual cash already paid. When used, the tracker estimates principal and interest from the schedule.",
  repayPrincipalPaidInput: "Total Principal Paid: total balance reduction, including principal paid through EMIs and any extra principal payments. It is capped by post-holiday opening principal.",
  repayInterestPaidInput: "Interest Paid So Far: editable actual interest paid. Enter it together with principal paid when you have lender statements.",
  repayRemainingPrincipalInput: "Total Principal Remaining: current outstanding balance from your lender. It includes original borrowed amount plus unpaid holiday interest, minus all principal repaid and prepayments.",
  repayMaturityDateInput: "Current Maturity Date: the latest maturity shown by your lender after all past EMI changes and prepayments. Repayment calculations use this as the remaining tenure.",
  prepaymentInput: "Prepayment Amount: extra principal paid now. Reduce Tenure keeps EMI fixed; Reduce EMI keeps tenure target similar.",
  desiredClosureDateInput: "Desired Closure Date: target payoff date for the Close Early tab. Strategies calculate required extra principal from current date."
};

function setupInfoButtons() {
  document.querySelectorAll(".control-head label").forEach((label) => {
    const id = label.getAttribute("for");
    const note = parameterNotes[id];
    const head = label.closest(".control-head");
    if (!note || !head || head.querySelector(".note-btn")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-btn";
    button.setAttribute("aria-label", `About ${label.textContent.trim()}`);
    button.textContent = "i";
    button.addEventListener("click", () => showNotice(note));
    label.insertAdjacentElement("afterend", button);
  });
}

function monthlyRate(annualRate) {
  return safeNumber(annualRate) / 1200;
}

function emiFactor(annualRate, months) {
  const n = Math.max(1, Math.round(safeNumber(months)));
  const r = monthlyRate(annualRate);
  if (Math.abs(r) < 1e-10) return 1 / n;
  const growth = Math.pow(1 + r, n);
  return (r * growth) / (growth - 1);
}

function holidaySummary(
  principal,
  annualRate,
  moratoriumMonths = 0,
  holidayMode = state.holidayMode,
  principalMonthly = state.holidayPrincipalMonthly
) {
  const p = Math.max(0, safeNumber(principal));
  const delay = Math.max(0, Math.round(safeNumber(moratoriumMonths)));
  const rate = monthlyRate(annualRate);
  const mode = ["capitalize", "interestOnly", "principalOnly"].includes(holidayMode) ? holidayMode : "capitalize";
  const monthlyPrincipal = Math.max(0, safeNumber(principalMonthly));
  let principalBalance = p;
  let accruedInterest = 0;
  let totalPaid = 0;
  let totalInterest = 0;
  let principalPaid = 0;

  for (let month = 1; month <= delay; month += 1) {
    if (mode === "principalOnly") {
      const principalPayment = Math.min(monthlyPrincipal, principalBalance);
      principalBalance -= principalPayment;
      totalPaid += principalPayment;
      principalPaid += principalPayment;
    }

    const interest = Math.max(0, principalBalance * rate);
    totalInterest += interest;

    if (mode === "interestOnly") {
      totalPaid += interest;
    } else {
      accruedInterest += interest;
    }
  }

  const balance = principalBalance + accruedInterest;
  return { balance, totalPaid, totalInterest, principalPaid };
}

function capitalizedPrincipal(principal, annualRate, moratoriumMonths = 0, holidayMode = state.holidayMode, principalMonthly = state.holidayPrincipalMonthly) {
  return holidaySummary(principal, annualRate, moratoriumMonths, holidayMode, principalMonthly).balance;
}

function moratoriumInterestFor(
  principal = state.principal,
  annualRate = state.annualRate,
  moratoriumMonths = state.moratoriumMonths,
  holidayMode = state.holidayMode,
  principalMonthly = state.holidayPrincipalMonthly
) {
  return holidaySummary(principal, annualRate, moratoriumMonths, holidayMode, principalMonthly).totalInterest;
}

function openingPrincipalForCurrentPlan() {
  return capitalizedPrincipal(state.principal, state.annualRate, state.moratoriumMonths);
}

function calculateEmi(principal, annualRate, months, moratoriumMonths = 0, holidayMode = state.holidayMode, principalMonthly = state.holidayPrincipalMonthly) {
  return capitalizedPrincipal(principal, annualRate, moratoriumMonths, holidayMode, principalMonthly) * emiFactor(annualRate, months);
}

function solveAnnualRateForEmi(principal, months, emi, moratoriumMonths = 0, holidayMode = state.holidayMode, principalMonthly = state.holidayPrincipalMonthly) {
  const p = Math.max(0, safeNumber(principal));
  const n = Math.max(1, Math.round(safeNumber(months)));
  const payment = Math.max(0, safeNumber(emi));
  if (p <= 0 || payment <= 0) return 0;
  const zeroRatePayment = p / n;
  if (payment <= zeroRatePayment) return 0;

  let low = 0;
  let high = fields.annualRate.max;
  for (let i = 0; i < 90; i += 1) {
    const mid = (low + high) / 2;
    const testPayment = calculateEmi(p, mid, n, moratoriumMonths, holidayMode, principalMonthly);
    if (testPayment < payment) low = mid;
    else high = mid;
  }
  return clamp((low + high) / 2, 0, fields.annualRate.max);
}

function solvePrincipalForEmi(emi, annualRate, months, moratoriumMonths = 0) {
  const payment = Math.max(0, safeNumber(emi));
  if (payment <= 0) return 0;
  let low = 0;
  let high = Math.max(payment, state.principal, 10000);
  for (let guard = 0; guard < 80; guard += 1) {
    if (calculateEmi(high, annualRate, months, moratoriumMonths) >= payment || high >= fields.principal.max) break;
    high *= 2;
  }
  high = Math.min(high, fields.principal.max);
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    if (calculateEmi(mid, annualRate, months, moratoriumMonths) < payment) low = mid;
    else high = mid;
  }
  return clamp(high, 0, fields.principal.max);
}

function solveRateFromEmi(principal, months, emi) {
  return solveAnnualRateForEmi(principal, months, emi, 0);
}

function solveDurationFromEmi(principal, annualRate, emi) {
  const p = Math.max(0, safeNumber(principal));
  const r = monthlyRate(annualRate);
  const payment = Math.max(0, safeNumber(emi));
  if (p <= 0 || payment <= 0) return 1;
  if (Math.abs(r) < 1e-10) return clamp(Math.ceil(p / payment), 1, fields.durationMonths.max);
  if (payment <= p * r) return fields.durationMonths.max;
  const months = -Math.log(1 - (p * r) / payment) / Math.log(1 + r);
  return clamp(Math.ceil(months), 1, fields.durationMonths.max);
}

function minDurationForEmiCap(principal = state.principal, annualRate = state.annualRate) {
  const p = capitalizedPrincipal(principal, annualRate, state.moratoriumMonths);
  if (p <= 0) return 1;
  return solveDurationFromEmi(p, annualRate, Math.max(0, safeNumber(principal)));
}

function emiBounds() {
  const principal = Math.max(0, safeNumber(state.principal));
  const months = Math.max(1, Math.round(state.durationMonths));
  const fundedPrincipal = capitalizedPrincipal(principal, state.annualRate, state.moratoriumMonths);
  let min = 0;

  if (principal > 0) {
    if (autoKey === "annualRate") {
      min = fundedPrincipal / months;
    } else if (autoKey === "durationMonths") {
      min = calculateEmi(principal, state.annualRate, fields.durationMonths.max, state.moratoriumMonths);
    } else if (autoKey === "principal") {
      min = 0;
    } else {
      min = calculateEmi(principal, state.annualRate, months, state.moratoriumMonths);
    }
  }

  const max = Math.max(principal, fundedPrincipal);
  const sliderVisualMax = Math.min(max, fields.monthlyEmi.sliderMax);
  const step = fields.monthlyEmi.step;
  const steppedMin = Math.min(max, roundUpToStep(min, step));
  const steppedMax = Math.max(0, roundDownToStep(sliderVisualMax, step) || sliderVisualMax);
  return {
    min,
    max,
    sliderMin: Math.min(steppedMin, steppedMax),
    sliderMax: Math.max(steppedMin, steppedMax)
  };
}

function maxAnnualRateForPlan() {
  const principal = Math.max(0, state.principal);
  if (principal <= 0 || autoKey === "annualRate") return fields.annualRate.max;
  const fundedPrincipal = capitalizedPrincipal(principal, state.annualRate, state.moratoriumMonths);

  const months = autoKey === "durationMonths"
    ? fields.durationMonths.max
    : Math.max(1, state.durationMonths);
  const paymentLimit = autoKey === "monthlyEmi"
    ? fundedPrincipal
    : Math.min(fundedPrincipal, Math.max(0, state.monthlyEmi));

  if (paymentLimit <= 0) return fields.annualRate.max;
  return Math.min(fields.annualRate.max, solveAnnualRateForEmi(principal, months, paymentLimit, state.moratoriumMonths));
}

function durationLabel(months) {
  const n = Math.max(0, Math.round(safeNumber(months)));
  if (n === 0) return "0 months";
  const years = Math.floor(n / 12);
  const monthPart = n % 12;
  if (years === 0) return `${monthPart} month${monthPart === 1 ? "" : "s"}`;
  if (monthPart === 0) return `${years} year${years === 1 ? "" : "s"}`;
  return `${years} yr ${monthPart} mo`;
}

function latestOf(keys) {
  return keys.reduce((best, key) => (touched[key] > touched[best] ? key : best), keys[0]);
}

function solveAutoField() {
  normalizeState();
  enforcePracticalLimits();
  let n = Math.max(1, Math.round(state.durationMonths));
  let factor = emiFactor(state.annualRate, n);
  let status = `Auto: ${labelFor(autoKey)}`;

  if (autoKey === "principal") {
    state.principal = solvePrincipalForEmi(state.monthlyEmi, state.annualRate, n, state.moratoriumMonths);
  }

  if (autoKey === "annualRate") {
    state.annualRate = solveAnnualRateForEmi(state.principal, n, state.monthlyEmi, state.moratoriumMonths);
  }

  if (autoKey === "durationMonths") {
    state.durationMonths = solveDurationFromEmi(
      capitalizedPrincipal(state.principal, state.annualRate, state.moratoriumMonths),
      state.annualRate,
      state.monthlyEmi
    );
  }

  if (autoKey === "monthlyEmi") {
    state.monthlyEmi = calculateEmi(state.principal, state.annualRate, n, state.moratoriumMonths);
  }

  normalizeState();
  enforcePracticalLimits();
  n = Math.max(1, Math.round(state.durationMonths));
  factor = emiFactor(state.annualRate, n);
  const openingPrincipal = capitalizedPrincipal(state.principal, state.annualRate, state.moratoriumMonths);
  if (autoKey === "monthlyEmi" && state.monthlyEmi > openingPrincipal) {
    state.monthlyEmi = openingPrincipal;
  }
  updateCalculatedTotals();
  syncCalculatedFollowers();
  const residual = consistencyResidual();
  if (residual > 0.06) status = "Values differ";
  solveStatus.textContent = status;
}

function syncCalculatedFollowers() {
  const n = Math.max(1, Math.round(state.durationMonths));

  if (!manual.monthlyEmi && autoKey !== "monthlyEmi") {
    state.monthlyEmi = calculateEmi(state.principal, state.annualRate, n, state.moratoriumMonths);
  }

  updateCalculatedTotals();

  normalizeState();
}

function updateCalculatedTotals() {
  const summary = scheduleSummary();
  state.totalInterest = summary.totalInterest;
  state.totalPaid = summary.totalPaid;
}

function consistencyResidual() {
  const n = Math.max(1, Math.round(state.durationMonths));
  const summary = scheduleSummary();
  const totalScale = Math.max(1, state.totalPaid, state.principal + state.totalInterest, summary.totalPaid);
  const emiScale = Math.max(1, state.monthlyEmi, calculateEmi(state.principal, state.annualRate, n, state.moratoriumMonths));
  const r1 = Math.abs(state.totalPaid - state.principal - state.totalInterest) / totalScale;
  const r2 = Math.abs(state.totalPaid - summary.totalPaid) / totalScale;
  const r3 = summary.paidOff ? 0 : 1;
  return Math.max(r1, r2, r3);
}

function normalizeState() {
  state.principal = clamp(safeNumber(state.principal), 0, fields.principal.max);
  state.annualRate = clamp(safeNumber(state.annualRate), 0, fields.annualRate.max);
  state.durationMonths = clamp(Math.round(safeNumber(state.durationMonths, 1)), 1, fields.durationMonths.max);
  state.moratoriumMonths = clamp(Math.round(safeNumber(state.moratoriumMonths, 0)), 0, fields.durationMonths.max);
  state.borrowedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(state.borrowedDate)) ? state.borrowedDate : todayIso();
  state.currentDate = /^\d{4}-\d{2}-\d{2}$/.test(String(state.currentDate)) ? state.currentDate : todayIso();
  state.hasHoliday = Boolean(state.hasHoliday || state.moratoriumMonths > 0);
  if (!state.hasHoliday) state.moratoriumMonths = 0;
  state.desiredClosureDate = /^\d{4}-\d{2}-\d{2}$/.test(String(state.desiredClosureDate))
    ? state.desiredClosureDate
    : isoFromDate(addMonthsToIso(state.currentDate, 60));
  state.holidayMode = ["capitalize", "interestOnly", "principalOnly"].includes(state.holidayMode)
    ? state.holidayMode
    : "capitalize";
  state.holidayPrincipalMonthly = clamp(safeNumber(state.holidayPrincipalMonthly), 0, Math.max(0, state.principal));
  state.monthlyEmi = clamp(
    safeNumber(state.monthlyEmi),
    0,
    Math.max(0, capitalizedPrincipal(state.principal, state.annualRate, state.moratoriumMonths))
  );
  state.totalInterest = clamp(safeNumber(state.totalInterest), 0, fields.totalInterest.max);
  state.totalPaid = clamp(safeNumber(state.totalPaid), 0, fields.totalPaid.max);
}

function enforcePracticalLimits(changedKey = "") {
  if ((changedKey === "annualRate" || changedKey === "moratoriumMonths") && autoKey !== "annualRate") {
    const maxRate = maxAnnualRateForPlan();
    if (state.annualRate > maxRate) {
      state.annualRate = maxRate;
      queueNotice(
        `Interest rate capped at ${percent(maxRate)} because this plan would need an EMI above the loan amount.`,
        "annualRate"
      );
    }
  }

  const minDuration = minDurationForEmiCap();

  if (autoKey !== "durationMonths" && changedKey === "durationMonths" && state.durationMonths < minDuration) {
    state.durationMonths = minDuration;
    queueNotice(
      `Duration increased to ${durationLabel(minDuration)} so the EMI does not exceed the borrowed amount.`,
      changedKey || "durationMonths"
    );
  }

  if (autoKey !== "durationMonths" && changedKey !== "annualRate" && state.durationMonths < minDuration) {
    state.durationMonths = minDuration;
    queueNotice(
      `Duration adjusted to ${durationLabel(minDuration)} for a practical EMI cap.`,
      changedKey || "durationMonths"
    );
  }

  const bounds = emiBounds();
  if (autoKey !== "monthlyEmi" && state.monthlyEmi > bounds.max) {
    state.monthlyEmi = bounds.max;
    queueNotice("Monthly EMI cannot be more than the principal outstanding at EMI start.", changedKey || "monthlyEmi");
  }

  if (autoKey !== "monthlyEmi" && state.monthlyEmi > 0 && state.monthlyEmi + 0.01 < bounds.min) {
    state.monthlyEmi = bounds.min;
    const label = autoKey === "durationMonths"
      ? durationLabel(fields.durationMonths.max)
      : durationLabel(state.durationMonths);
    queueNotice(
      `EMI raised to the practical minimum needed to close the loan within ${label}.`,
      changedKey || "monthlyEmi"
    );
  }

  normalizeState();
}

function labelFor(key) {
  const labels = {
    principal: "Loan Amount",
    annualRate: "Interest Yearly",
    durationMonths: "Duration",
    monthlyEmi: "Monthly EMI",
    totalInterest: "Total Interest",
    totalPaid: "Total Amount Paid"
  };
  return labels[key];
}

function setAutoKey(nextKey) {
  if (!adjustableKeys.includes(nextKey)) return;
  pendingNotice = "";
  autoKey = nextKey;
  manual[nextKey] = false;
  enforcePracticalLimits(nextKey);
  render();
  if (pendingNotice) showNotice(pendingNotice);
}

function chooseReplacementAuto(editedKey) {
  if (editedKey !== autoKey) return;
  const keys = adjustableKeys.filter((key) => key !== editedKey);
  autoKey = keys.reduce((oldest, key) => (touched[key] < touched[oldest] ? key : oldest), keys[0]);
  manual[autoKey] = false;
}

function handleValueChange(key, value) {
  if (isRendering) return;
  if (calculatedKeys.has(key)) return;
  pendingNotice = "";
  manual[key] = true;
  touched[key] = clock;
  clock += 1;
  chooseReplacementAuto(key);

  if (key === "durationMonths") state.durationMonths = clamp(Math.round(safeNumber(value, 1)), 1, fields.durationMonths.max);
  else if (key === "annualRate") {
    const parsed = parseDecimal(value);
    if (parsed === null) return;
    state.annualRate = parsed;
  } else state[key] = amountKeys.has(key) ? parseAmount(value) : safeNumber(value);

  normalizeState();
  enforcePracticalLimits(key);
  render();
  if (pendingNotice) showNotice(pendingNotice);
}

function handleDurationInput() {
  if (isRendering) return;
  const years = Math.max(0, Math.round(safeNumber(fields.durationMonths.input.value)));
  const months = clamp(Math.round(safeNumber(fields.durationMonths.monthInput.value)), 0, 11);
  handleValueChange("durationMonths", clamp(Math.max(1, years * 12 + months), 1, fields.durationMonths.max));
}

function handleBorrowedDateChange(value) {
  if (isRendering) return;
  state.borrowedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? value : todayIso();
  render();
}

function handleCurrentDateChange(value) {
  if (isRendering) return;
  state.currentDate = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? value : todayIso();
  render();
}

function handleHolidayToggle(value) {
  if (isRendering) return;
  state.hasHoliday = value === "yes";
  if (!state.hasHoliday) state.moratoriumMonths = 0;
  render();
}

function handleMoratoriumChange(value) {
  if (isRendering) return;
  pendingNotice = "";
  state.hasHoliday = true;
  state.moratoriumMonths = clamp(Math.round(safeNumber(value, 0)), 0, fields.durationMonths.max);
  normalizeState();
  enforcePracticalLimits("moratoriumMonths");
  render();
  if (pendingNotice) showNotice(pendingNotice);
}

function handleHolidayModeChange(value) {
  if (isRendering) return;
  pendingNotice = "";
  state.hasHoliday = true;
  state.holidayMode = ["capitalize", "interestOnly", "principalOnly"].includes(value) ? value : "capitalize";
  enforcePracticalLimits("moratoriumMonths");
  render();
  if (pendingNotice) showNotice(pendingNotice);
}

function handleHolidayPrincipalChange(value) {
  if (isRendering) return;
  pendingNotice = "";
  state.hasHoliday = true;
  state.holidayPrincipalMonthly = clamp(parseAmount(value), 0, Math.max(0, state.principal));
  enforcePracticalLimits("moratoriumMonths");
  render();
  if (pendingNotice) showNotice(pendingNotice);
}

function handleDesiredClosureDate(value) {
  if (isRendering) return;
  state.desiredClosureDate = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? value : isoFromDate(addMonthsToIso(state.currentDate, 60));
  renderClosure();
}

function handleMoratoriumInput() {
  if (isRendering) return;
  const years = Math.max(0, Math.round(safeNumber(calendarControls.moratoriumYears.value)));
  const months = clamp(Math.round(safeNumber(calendarControls.moratoriumMonths.value)), 0, 11);
  handleMoratoriumChange(clamp(years * 12 + months, 0, fields.durationMonths.max));
}

function setSliderPinnedState(key, value, max) {
  const field = fields[key];
  if (!field) return;
  const pinned = safeNumber(value) > safeNumber(max);
  field.card.classList.toggle("above-slider", pinned);
  field.range.dataset.pinned = pinned ? "true" : "false";
}

function renderInputs() {
  isRendering = true;
  const activeInput = document.activeElement;

  Object.entries(fields).forEach(([key, field]) => {
    field.card.classList.toggle("is-auto", key === autoKey);
    field.card.classList.toggle("is-calculated", calculatedKeys.has(key));
    const autoButton = field.card.querySelector(".auto-btn");
    if (autoButton) autoButton.classList.toggle("active", key === autoKey);
  });

  const durationMin = minDurationForEmiCap();
  const bounds = emiBounds();
  fields.principal.range.max = String(fields.principal.sliderMax);
  fields.annualRate.range.max = String(fields.annualRate.sliderMax);
  fields.durationMonths.range.min = String(Math.min(durationMin, fields.durationMonths.sliderMax));
  fields.durationMonths.range.max = String(fields.durationMonths.sliderMax);
  fields.monthlyEmi.range.min = String(bounds.sliderMin);
  fields.monthlyEmi.range.max = String(bounds.sliderMax);

  if (activeInput !== fields.principal.input) fields.principal.input.value = formatAmount(state.principal);
  fields.principal.range.value = Math.min(Math.round(state.principal), fields.principal.sliderMax);
  if (activeInput !== fields.annualRate.input) fields.annualRate.input.value = state.annualRate.toFixed(2);
  fields.annualRate.range.value = Math.min(Number(state.annualRate.toFixed(2)), fields.annualRate.sliderMax);
  fields.durationMonths.range.value = Math.min(Math.round(state.durationMonths), fields.durationMonths.sliderMax);
  fields.durationMonths.input.value = Math.floor(state.durationMonths / 12);
  fields.durationMonths.monthInput.value = state.durationMonths % 12;
  if (activeInput !== calendarControls.borrowedDate) calendarControls.borrowedDate.value = state.borrowedDate;
  if (activeInput !== calendarControls.currentDate) calendarControls.currentDate.value = state.currentDate;
  calendarControls.hasHoliday.value = state.hasHoliday ? "yes" : "no";
  calendarControls.moratoriumRange.value = Math.min(Math.round(state.moratoriumMonths), Number(calendarControls.moratoriumRange.max));
  calendarControls.moratoriumYears.value = Math.floor(state.moratoriumMonths / 12);
  calendarControls.moratoriumMonths.value = state.moratoriumMonths % 12;
  calendarControls.holidayMode.value = state.holidayMode;
  const openingPrincipal = capitalizedPrincipal(state.principal, state.annualRate, state.moratoriumMonths);
  const holidaySliderMax = Math.min(state.principal, fields.monthlyEmi.sliderMax);
  calendarControls.holidayPrincipalRange.max = String(Math.max(0, Math.round(holidaySliderMax)));
  calendarControls.holidayPrincipalRange.value = String(Math.min(Math.round(state.holidayPrincipalMonthly), Math.round(holidaySliderMax)));
  if (activeInput !== calendarControls.holidayPrincipalInput) {
    calendarControls.holidayPrincipalInput.value = formatAmount(state.holidayPrincipalMonthly);
  }
  calendarControls.holidayPrincipalCap.textContent =
    `Slider up to ${money(holidaySliderMax)}. Type up to ${money(state.principal)}.`;
  const postHolidaySliderMax = Math.min(Math.max(openingPrincipal, state.principal), 5000000);
  calendarControls.postHolidayPrincipalRange.max = String(Math.max(0, Math.round(postHolidaySliderMax)));
  calendarControls.postHolidayPrincipalRange.value = String(Math.min(Math.round(openingPrincipal), Math.round(postHolidaySliderMax)));
  calendarControls.postHolidayPrincipalInput.value = formatAmount(openingPrincipal);
  const holidayDisabled = !state.hasHoliday;
  [
    calendarControls.moratoriumRange,
    calendarControls.moratoriumYears,
    calendarControls.moratoriumMonths,
    calendarControls.holidayMode,
    calendarControls.holidayPrincipalRange,
    calendarControls.holidayPrincipalInput
  ].forEach((control) => {
    control.disabled = holidayDisabled;
  });
  calendarControls.card.classList.toggle(
    "above-slider",
    state.moratoriumMonths > Number(calendarControls.moratoriumRange.max)
      || state.holidayPrincipalMonthly > holidaySliderMax
  );
  if (activeInput !== fields.monthlyEmi.input) fields.monthlyEmi.input.value = formatAmount(state.monthlyEmi);
  fields.monthlyEmi.range.value = Math.min(Math.round(state.monthlyEmi), bounds.sliderMax);
  emiCapLabel.textContent = `Slider up to ${money(bounds.sliderMax)}. Type up to ${money(bounds.max)}.`;
  fields.totalInterest.input.value = formatAmount(state.totalInterest);
  fields.totalInterest.range.value = Math.round(state.totalInterest);
  fields.totalPaid.input.value = formatAmount(state.totalPaid);
  fields.totalPaid.range.value = Math.round(state.totalPaid);
  setSliderPinnedState("principal", state.principal, fields.principal.sliderMax);
  setSliderPinnedState("annualRate", state.annualRate, fields.annualRate.sliderMax);
  setSliderPinnedState("durationMonths", state.durationMonths, fields.durationMonths.sliderMax);
  setSliderPinnedState("monthlyEmi", state.monthlyEmi, bounds.sliderMax);

  isRendering = false;
}

function renderSummary() {
  updateCalculatedTotals();
  const summary = scheduleSummary();
  const total = Math.max(1, state.totalPaid);
  const interestShare = clamp((state.totalInterest / total) * 100, 0, 100);
  const startDate = addMonthsToIso(state.borrowedDate, state.moratoriumMonths);
  const maturityDate = addMonthsToIso(state.borrowedDate, summary.months);
  document.getElementById("summaryEmi").textContent = money(state.monthlyEmi);
  document.getElementById("summaryRate").textContent = percent(state.annualRate);
  document.getElementById("summaryMonthlyRate").textContent = percent(state.annualRate / 12);
  document.getElementById("summaryStartDate").textContent = formatDate(startDate);
  document.getElementById("summaryMaturityDate").textContent = formatDate(maturityDate);
  document.getElementById("metricPrincipal").textContent = money(state.principal);
  document.getElementById("metricOpeningPrincipal").textContent =
    money(capitalizedPrincipal(state.principal, state.annualRate, state.moratoriumMonths));
  document.getElementById("metricInterest").textContent = money(state.totalInterest);
  document.getElementById("metricTotal").textContent = money(state.totalPaid);
  document.getElementById("interestShare").textContent = percent(interestShare);
  durationBadge.textContent = state.moratoriumMonths > 0
    ? `${durationLabel(state.moratoriumMonths)} delay + ${durationLabel(state.durationMonths)} EMI`
    : durationLabel(state.durationMonths);
  runwayLabel.textContent = durationLabel(summary.months);
  renderInsights();
}

function renderInsights() {
  const summary = scheduleSummary();
  const schedule = summary.schedule;
  const first = schedule.find((row) => row.payment > 0) || schedule[0] || { principalPaid: 0, interest: 0 };
  const load = state.principal > 0 ? (state.totalInterest / state.principal) * 100 : 0;
  const halfway = schedule.find((row) => row.balance <= state.principal / 2);
  const boosted = payoffScenario(Math.min(state.principal, state.monthlyEmi * 1.1));
  const savedMonths = Math.max(0, summary.months - boosted.months);
  const savedInterest = Math.max(0, state.totalInterest - boosted.interest);

  document.getElementById("insightLoad").textContent = `${percent(load)} of principal`;
  document.getElementById("insightHalfway").textContent = halfway ? durationLabel(halfway.month) : "Beyond term";
  document.getElementById("insightFirstSplit").textContent = `${money(first.principalPaid).replace("Rs ", "")} / ${money(first.interest).replace("Rs ", "")}`;
  document.getElementById("insightFinalPayment").textContent = money(summary.lastPayment).replace("Rs ", "");
  document.getElementById("insightMoratorium").textContent = state.moratoriumMonths > 0
    ? money(moratoriumInterestFor()).replace("Rs ", "")
    : "No delay";
  document.getElementById("insightSavings").textContent = savedMonths > 0
    ? `${durationLabel(savedMonths)} | ${money(savedInterest).replace("Rs ", "")}`
    : "No material gain";
}

function payoffScenario(payment) {
  const rate = monthlyRate(state.annualRate);
  let balance = capitalizedPrincipal(state.principal, state.annualRate, state.moratoriumMonths);
  let interest = 0;
  let months = state.moratoriumMonths;
  const emi = Math.max(0, safeNumber(payment));

  if (balance <= 0 || emi <= 0) return { months: 0, interest: 0 };
  if (rate > 0 && emi <= balance * rate) return { months: 1200, interest: Number.POSITIVE_INFINITY };

  while (balance > 0 && months < 1200) {
    const monthlyInterest = Math.max(0, balance * rate);
    const principalPaid = Math.max(0, Math.min(balance, emi - monthlyInterest));
    interest += monthlyInterest;
    balance = Math.max(0, balance - principalPaid);
    months += 1;
  }

  return { months, interest: interest + moratoriumInterestFor() };
}

function getSchedule() {
  return getScheduleFor(
    state.principal,
    state.annualRate,
    state.durationMonths,
    state.monthlyEmi,
    state.moratoriumMonths,
    state.holidayMode,
    state.holidayPrincipalMonthly
  );
}

function getScheduleFor(
  principal,
  annualRate,
  durationMonths,
  monthlyEmi,
  moratoriumMonths = 0,
  holidayMode = "capitalize",
  holidayPrincipalMonthly = 0
) {
  const rows = [];
  if (safeNumber(principal) <= 0) return rows;
  const months = Math.max(1, Math.round(durationMonths));
  const delayMonths = Math.max(0, Math.round(safeNumber(moratoriumMonths)));
  const originalPrincipal = Math.max(0, safeNumber(principal));
  const rate = monthlyRate(annualRate);
  const emi = Math.max(0, safeNumber(monthlyEmi));
  const mode = ["capitalize", "interestOnly", "principalOnly"].includes(holidayMode) ? holidayMode : "capitalize";
  const monthlyHolidayPrincipal = Math.max(0, safeNumber(holidayPrincipalMonthly));
  let principalBalance = originalPrincipal;
  let accruedHolidayInterest = 0;
  let balance = originalPrincipal;
  let cumulativePrincipal = 0;
  let cumulativePaid = 0;
  let month = 0;

  for (let delay = 1; delay <= delayMonths; delay += 1) {
    month += 1;
    const startBalance = balance;
    let principalPaid = 0;
    let payment = 0;

    if (mode === "principalOnly") {
      principalPaid = Math.min(monthlyHolidayPrincipal, principalBalance);
      principalBalance = Math.max(0, principalBalance - principalPaid);
      payment += principalPaid;
    }

    const interest = Math.max(0, principalBalance * rate);
    if (mode === "interestOnly") {
      payment += interest;
    } else {
      accruedHolidayInterest += interest;
    }
    balance = principalBalance + accruedHolidayInterest;
    cumulativePaid += payment;
    cumulativePrincipal += principalPaid;
    const cumulativeInterest = Math.max(0, cumulativePaid + balance - originalPrincipal);
    rows.push({
      month,
      phase: "moratorium",
      startBalance,
      payment,
      principalPaid,
      interest,
      balance,
      cumulativePrincipal,
      cumulativeInterest,
      cumulativePaid
    });
  }

  for (let paymentMonth = 1; paymentMonth <= months; paymentMonth += 1) {
    month += 1;
    const startBalance = balance;
    const interest = Math.max(0, balance * rate);
    if (emi <= 0 || (emi <= interest && balance > 0.01)) {
      rows.push({
        month,
        phase: "repayment",
        startBalance,
        payment: emi,
        principalPaid: 0,
        interest,
        balance,
        cumulativePrincipal,
        cumulativeInterest: Math.max(0, cumulativePaid + balance - originalPrincipal),
        cumulativePaid
      });
      break;
    }

    const payment = Math.min(emi, balance + interest);
    const principalPaid = Math.max(0, Math.min(balance, payment - interest));
    balance = Math.max(0, balance - principalPaid);
    cumulativePrincipal += principalPaid;
    cumulativePaid += payment;
    rows.push({
      month,
      phase: "repayment",
      startBalance,
      payment,
      principalPaid,
      interest,
      balance,
      cumulativePrincipal,
      cumulativeInterest: Math.max(0, cumulativePaid + balance - originalPrincipal),
      cumulativePaid
    });
    if (balance <= 0.01) {
      break;
    }
  }
  return rows;
}

function scheduleSummary(
  principal = state.principal,
  annualRate = state.annualRate,
  durationMonths = state.durationMonths,
  monthlyEmi = state.monthlyEmi,
  moratoriumMonths = state.moratoriumMonths,
  holidayMode = state.holidayMode,
  holidayPrincipalMonthly = state.holidayPrincipalMonthly
) {
  if (safeNumber(principal) <= 0) {
    return {
      schedule: [],
      paidOff: true,
      months: 0,
      lastPayment: 0,
      totalInterest: 0,
      totalPaid: 0,
      remainingBalance: 0
    };
  }
  const originalPrincipal = Math.max(0, safeNumber(principal));
  const schedule = getScheduleFor(
    principal,
    annualRate,
    durationMonths,
    monthlyEmi,
    moratoriumMonths,
    holidayMode,
    holidayPrincipalMonthly
  );
  const last = schedule[schedule.length - 1] || {
    balance: originalPrincipal,
    cumulativeInterest: 0,
    cumulativePaid: 0,
    month: 0,
    payment: 0
  };

  return {
    schedule,
    paidOff: last.balance <= 0.01,
    months: last.month,
    lastPayment: last.payment,
    totalInterest: Math.max(0, last.cumulativePaid + last.balance - originalPrincipal),
    totalPaid: last.cumulativePaid,
    remainingBalance: last.balance
  };
}

function progressFromTotalPaid(totalPaid) {
  const schedule = getSchedule();
  const target = clamp(totalPaid, 0, state.totalPaid);
  if (target <= 0.01) {
    return progressFromElapsedMonths(monthsBetween(state.borrowedDate, state.currentDate));
  }
  let previous = {
    balance: state.principal,
    cumulativePrincipal: 0,
    cumulativePaid: 0,
    month: 0
  };

  for (const row of schedule) {
    if (row.payment <= 0) {
      previous = row;
      continue;
    }
    if (target >= row.cumulativePaid - 0.01) {
      previous = row;
      continue;
    }

    const partial = Math.max(0, target - previous.cumulativePaid);
    const fraction = row.payment > 0 ? clamp(partial / row.payment, 0, 1) : 0;
    const originalPrincipalPaid = Math.max(0, row.cumulativePrincipal - previous.cumulativePrincipal) * fraction;
    const balance = Math.max(0, row.startBalance - row.principalPaid * fraction);
    return {
      month: previous.month + fraction,
      totalPaid: target,
      principalPaid: previous.cumulativePrincipal + originalPrincipalPaid,
      interestPaid: Math.max(0, target - (previous.cumulativePrincipal + originalPrincipalPaid)),
      remainingPrincipal: balance
    };
  }

  return {
    month: previous.month,
    totalPaid: previous.cumulativePaid,
    principalPaid: previous.cumulativePrincipal,
    interestPaid: Math.max(0, previous.cumulativePaid - previous.cumulativePrincipal),
    remainingPrincipal: previous.balance
  };
}

function progressFromPrincipalPaid(principalPaid) {
  const schedule = getSchedule();
  const target = clamp(principalPaid, 0, openingPrincipalForCurrentPlan());
  if (target <= 0.01) {
    return progressFromElapsedMonths(monthsBetween(state.borrowedDate, state.currentDate));
  }
  let previous = {
    balance: state.principal,
    cumulativePrincipal: 0,
    cumulativePaid: 0,
    month: 0
  };

  for (const row of schedule) {
    if (row.payment <= 0) {
      previous = row;
      continue;
    }
    if (target >= row.cumulativePrincipal - 0.01) {
      previous = row;
      continue;
    }

    const originalPrincipalThisRow = Math.max(0, row.cumulativePrincipal - previous.cumulativePrincipal);
    if (originalPrincipalThisRow <= 0) {
      previous = row;
      continue;
    }
    const principalNeeded = Math.max(0, target - previous.cumulativePrincipal);
    const fraction = clamp(principalNeeded / originalPrincipalThisRow, 0, 1);
    const principalPaidNow = originalPrincipalThisRow * fraction;
    const balanceReduction = row.principalPaid * fraction;
    const paidNow = row.payment * fraction;
    return {
      month: previous.month + fraction,
      totalPaid: previous.cumulativePaid + paidNow,
      principalPaid: target,
      interestPaid: Math.max(0, previous.cumulativePaid + paidNow - target),
      remainingPrincipal: Math.max(0, row.startBalance - balanceReduction)
    };
  }

  return {
    month: previous.month,
    totalPaid: previous.cumulativePaid,
    principalPaid: previous.cumulativePrincipal,
    interestPaid: Math.max(0, previous.cumulativePaid - previous.cumulativePrincipal),
    remainingPrincipal: previous.balance
  };
}

function progressFromManualPaid(principalPaid, interestPaid) {
  const elapsed = monthsBetween(state.borrowedDate, state.currentDate);
  const openingPrincipal = openingPrincipalForCurrentPlan();
  const paidPrincipal = clamp(principalPaid, 0, openingPrincipal);
  const paidInterest = Math.max(0, safeNumber(interestPaid));
  const dateProgress = progressFromElapsedMonths(elapsed);
  const month = Math.max(dateProgress.month, state.moratoriumMonths);

  return {
    month,
    totalPaid: paidPrincipal + paidInterest,
    principalPaid: paidPrincipal,
    interestPaid: paidInterest,
    remainingPrincipal: Math.max(0, openingPrincipal - paidPrincipal)
  };
}

function progressFromElapsedMonths(elapsedMonths) {
  const schedule = getSchedule();
  const target = clamp(safeNumber(elapsedMonths), 0, schedule.length);
  if (target <= 0.01 || schedule.length === 0) {
    return {
      month: 0,
      totalPaid: 0,
      principalPaid: 0,
      interestPaid: 0,
      remainingPrincipal: state.principal
    };
  }

  let previous = {
    balance: state.principal,
    cumulativePrincipal: 0,
    cumulativePaid: 0,
    month: 0
  };

  for (const row of schedule) {
    if (target >= row.month - 0.01) {
      previous = row;
      continue;
    }

    const span = Math.max(1, row.month - previous.month);
    const fraction = clamp((target - previous.month) / span, 0, 1);
    const totalPaid = previous.cumulativePaid + (row.cumulativePaid - previous.cumulativePaid) * fraction;
    const principalPaid = previous.cumulativePrincipal + (row.cumulativePrincipal - previous.cumulativePrincipal) * fraction;
    const balance = previous.balance + (row.balance - previous.balance) * fraction;
    return {
      month: target,
      totalPaid,
      principalPaid,
      interestPaid: Math.max(0, totalPaid - principalPaid),
      remainingPrincipal: Math.max(0, balance)
    };
  }

  return {
    month: previous.month,
    totalPaid: previous.cumulativePaid,
    principalPaid: previous.cumulativePrincipal,
    interestPaid: Math.max(0, previous.cumulativePaid - previous.cumulativePrincipal),
    remainingPrincipal: previous.balance
  };
}

function defaultRepaymentMaturityDate() {
  return isoFromDate(addMonthsToIso(state.borrowedDate, scheduleSummary().months));
}

function syncRepaymentDefaults() {
  const openingPrincipal = openingPrincipalForCurrentPlan();
  if (!repaymentState.manualRemaining) {
    repaymentState.remainingPrincipal = openingPrincipal;
  }
  repaymentState.remainingPrincipal = clamp(
    safeNumber(repaymentState.remainingPrincipal, openingPrincipal),
    0,
    openingPrincipal
  );

  if (!repaymentState.manualMaturity || !/^\d{4}-\d{2}-\d{2}$/.test(String(repaymentState.maturityDate))) {
    repaymentState.maturityDate = defaultRepaymentMaturityDate();
  }
}

function repaymentModel() {
  updateCalculatedTotals();
  syncRepaymentDefaults();
  const baseSummary = scheduleSummary();
  const openingPrincipal = openingPrincipalForCurrentPlan();
  const remainingPrincipal = clamp(repaymentState.remainingPrincipal, 0, openingPrincipal);
  const remainingMonths = remainingPrincipal > 0
    ? Math.max(1, monthsBetween(state.currentDate, repaymentState.maturityDate))
    : 0;
  const progress = {
    month: monthsBetween(state.borrowedDate, state.currentDate),
    totalPaid: Math.max(0, openingPrincipal - remainingPrincipal),
    principalPaid: Math.max(0, openingPrincipal - remainingPrincipal),
    interestPaid: 0,
    remainingPrincipal
  };

  const baseline = remainingPrincipal > 0
    ? scheduleSummary(
      remainingPrincipal,
      state.annualRate,
      remainingMonths,
      state.monthlyEmi,
      0,
      "capitalize",
      0
    )
    : scheduleSummary(0, state.annualRate, 1, 0);
  const prepayment = clamp(repaymentState.prepayment, 0, remainingPrincipal);
  repaymentState.prepayment = prepayment;
  const postPrincipal = Math.max(0, remainingPrincipal - prepayment);

  const reduceTenure = postPrincipal > 0
    ? scheduleSummary(
      postPrincipal,
      state.annualRate,
      remainingMonths,
      Math.min(state.monthlyEmi, postPrincipal),
      0,
      "capitalize",
      0
    )
    : scheduleSummary(0, state.annualRate, 1, 0);
  const reduceEmiValue = postPrincipal > 0 && remainingMonths > 0
    ? Math.min(postPrincipal, calculateEmi(postPrincipal, state.annualRate, remainingMonths, 0, "capitalize", 0))
    : 0;
  const reduceEmi = postPrincipal > 0
    ? scheduleSummary(
      postPrincipal,
      state.annualRate,
      remainingMonths,
      reduceEmiValue,
      0,
      "capitalize",
      0
    )
    : scheduleSummary(0, state.annualRate, 1, 0);

  const tenureSavings = {
    interest: Math.max(0, baseline.totalInterest - reduceTenure.totalInterest),
    months: Math.max(0, baseline.months - reduceTenure.months)
  };
  const emiSavings = {
    interest: Math.max(0, baseline.totalInterest - reduceEmi.totalInterest),
    emiDrop: Math.max(0, state.monthlyEmi - reduceEmiValue)
  };

  return {
    baseSummary,
    progress,
    completedMonths: progress.month,
    remainingMoratoriumMonths: 0,
    remainingMonths,
    baseline,
    prepayment,
    postPrincipal,
    reduceTenure,
    reduceEmi,
    reduceEmiValue,
    tenureSavings,
    emiSavings
  };
}

function simulateRepaymentWithExtras(principal, annualRate, maxMonths, baseEmi, extras = {}) {
  const rate = monthlyRate(annualRate);
  const limit = Math.max(0, Math.round(safeNumber(maxMonths)));
  let balance = Math.max(0, safeNumber(principal));
  let totalPaid = 0;
  let totalInterest = 0;
  let totalExtra = 0;
  let months = 0;

  for (let month = 1; month <= limit && balance > 0.01; month += 1) {
    let extra = Math.max(0, safeNumber(extras.monthly || 0));
    if ((month - 1) % 12 === 0) extra += Math.max(0, safeNumber(extras.yearly || 0));
    extra += Math.max(0, safeNumber(extras.weekly || 0)) * (52 / 12);

    const startExtra = Math.min(extra, balance);
    balance -= startExtra;
    totalPaid += startExtra;
    totalExtra += startExtra;

    const interest = Math.max(0, balance * rate);
    totalInterest += interest;
    const payment = Math.min(Math.max(0, safeNumber(baseEmi)), balance + interest);
    const principalPaid = Math.max(0, payment - interest);
    balance = Math.max(0, balance - principalPaid);
    totalPaid += payment;
    months = month;

    if (payment <= interest && balance > 0.01 && startExtra <= 0) break;
  }

  return {
    paidOff: balance <= 0.01,
    months,
    remainingBalance: balance,
    totalInterest,
    totalPaid,
    totalExtra
  };
}

function solvePeriodicExtra(principal, annualRate, targetMonths, baseEmi, kind) {
  if (principal <= 0) return { amount: 0, summary: simulateRepaymentWithExtras(0, annualRate, 0, baseEmi) };

  const makeExtras = (amount) => ({
    monthly: kind === "monthly" ? amount : 0,
    yearly: kind === "yearly" ? amount : 0,
    weekly: kind === "weekly" ? amount : 0
  });
  const noExtraSummary = simulateRepaymentWithExtras(principal, annualRate, targetMonths, baseEmi, makeExtras(0));
  if (noExtraSummary.paidOff) return { amount: 0, summary: noExtraSummary };

  let low = 0;
  let high = Math.max(1000, principal);

  for (let guard = 0; guard < 60; guard += 1) {
    const test = simulateRepaymentWithExtras(principal, annualRate, targetMonths, baseEmi, makeExtras(high));
    if (test.paidOff) break;
    high *= 2;
    if (high > principal * 100 + 1) break;
  }

  for (let i = 0; i < 70; i += 1) {
    const mid = (low + high) / 2;
    const test = simulateRepaymentWithExtras(principal, annualRate, targetMonths, baseEmi, makeExtras(mid));
    if (test.paidOff) high = mid;
    else low = mid;
  }

  const amount = Math.ceil(high);
  return { amount, summary: simulateRepaymentWithExtras(principal, annualRate, targetMonths, baseEmi, makeExtras(amount)) };
}

function solveLumpForTarget(principal, annualRate, targetMonths, baseEmi) {
  const noLumpSummary = simulateRepaymentWithExtras(principal, annualRate, targetMonths, baseEmi);
  if (noLumpSummary.paidOff) return { amount: 0, summary: noLumpSummary };

  let low = 0;
  let high = Math.max(0, principal);
  for (let i = 0; i < 70; i += 1) {
    const mid = (low + high) / 2;
    const test = simulateRepaymentWithExtras(Math.max(0, principal - mid), annualRate, targetMonths, baseEmi);
    if (test.paidOff) high = mid;
    else low = mid;
  }
  const amount = Math.ceil(high);
  return {
    amount,
    summary: simulateRepaymentWithExtras(Math.max(0, principal - amount), annualRate, targetMonths, baseEmi)
  };
}

function closureStrategyModel(model) {
  const targetMonths = monthsBetween(state.currentDate, state.desiredClosureDate);
  const principal = Math.max(0, model.postPrincipal);
  const emptySummary = simulateRepaymentWithExtras(0, state.annualRate, 0, 0);
  const emptyOptions = [
    { key: "monthly", label: "Monthly", headline: "Monthly Start", amount: 0, totalExtra: 0, totalInterest: 0, interestSaved: 0, paidOff: true, summary: emptySummary, color: "#37d67a" },
    { key: "weekly", label: "Weekly", headline: "Weekly Start", amount: 0, totalExtra: 0, totalInterest: 0, interestSaved: 0, paidOff: true, summary: emptySummary, color: "#58d7ff" },
    { key: "yearly", label: "Yearly", headline: "Yearly Start", amount: 0, totalExtra: 0, totalInterest: 0, interestSaved: 0, paidOff: true, summary: emptySummary, color: "#f5b342" },
    { key: "lump", label: "One-Time", headline: "One-Time Now", amount: 0, totalExtra: 0, totalInterest: 0, interestSaved: 0, paidOff: true, summary: emptySummary, color: "#ff4d57" }
  ];
  if (targetMonths <= 0 || principal <= 0) {
    return {
      targetMonths,
      requiredEmi: 0,
      baselineInterest: Math.max(0, safeNumber(model.baseline.totalInterest)),
      monthly: { amount: 0, summary: emptySummary },
      weekly: { amount: 0, summary: emptySummary },
      yearly: { amount: 0, summary: emptySummary },
      lump: { amount: 0, summary: emptySummary },
      options: emptyOptions,
      best: emptyOptions[0]
    };
  }

  const requiredEmi = calculateEmi(principal, state.annualRate, targetMonths, 0, "capitalize", 0);
  const monthly = solvePeriodicExtra(principal, state.annualRate, targetMonths, state.monthlyEmi, "monthly");
  const weekly = solvePeriodicExtra(principal, state.annualRate, targetMonths, state.monthlyEmi, "weekly");
  const yearly = solvePeriodicExtra(principal, state.annualRate, targetMonths, state.monthlyEmi, "yearly");
  const lump = solveLumpForTarget(principal, state.annualRate, targetMonths, state.monthlyEmi);
  const baselineInterest = Math.max(0, safeNumber(model.baseline.totalInterest));
  const decorate = (key, label, headline, option, color, totalExtraOverride) => ({
    key,
    label,
    headline,
    amount: Math.max(0, safeNumber(option.amount)),
    totalExtra: Math.max(0, safeNumber(totalExtraOverride ?? option.summary.totalExtra)),
    totalInterest: Math.max(0, safeNumber(option.summary.totalInterest)),
    interestSaved: Math.max(0, baselineInterest - safeNumber(option.summary.totalInterest)),
    paidOff: Boolean(option.summary.paidOff),
    summary: option.summary,
    color
  });
  const options = [
    decorate("monthly", "Monthly", "Monthly Start", monthly, "#37d67a"),
    decorate("weekly", "Weekly", "Weekly Start", weekly, "#58d7ff"),
    decorate("yearly", "Yearly", "Yearly Start", yearly, "#f5b342"),
    decorate("lump", "One-Time", "One-Time Now", lump, "#ff4d57", lump.amount)
  ];
  const best = options.reduce((winner, item) => {
    if (item.interestSaved > winner.interestSaved + 0.01) return item;
    if (Math.abs(item.interestSaved - winner.interestSaved) <= 0.01 && item.totalExtra < winner.totalExtra) return item;
    return winner;
  }, options[0]);

  return {
    targetMonths,
    requiredEmi,
    baselineInterest,
    monthly,
    weekly,
    yearly,
    lump,
    options,
    best
  };
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * scale));
  const height = Math.max(1, Math.floor(rect.height * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawMixChart() {
  const { ctx, width, height } = setupCanvas(mixCanvas);
  ctx.clearRect(0, 0, width, height);

  const total = Math.max(1, state.principal + state.totalInterest);
  const principalRatio = clamp(state.principal / total, 0, 1);
  const interestRatio = 1 - principalRatio;
  const first = getSchedule().find((row) => row.payment > 0) || { principalPaid: 0, interest: 0 };
  const firstTotal = Math.max(1, first.principalPaid + first.interest);

  const x = 28;
  const w = Math.max(10, width - 56);
  const y = Math.max(86, height * 0.34);
  const h = 46;

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  roundedRect(ctx, x, y, w, h, 18);
  ctx.fill();

  ctx.fillStyle = "#e50914";
  roundedRect(ctx, x, y, w * principalRatio, h, 18);
  ctx.fill();
  ctx.fillStyle = "#f5b342";
  roundedRect(ctx, x + w * principalRatio, y, w * interestRatio, h, 18);
  ctx.fill();

  ctx.fillStyle = "#fff8f0";
  ctx.font = "900 13px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Principal", x, y - 18);
  ctx.fillStyle = "#ff4d57";
  ctx.fillText(compactMoney(state.principal), x, y + h + 28);

  ctx.fillStyle = "#fff8f0";
  ctx.textAlign = "right";
  ctx.fillText("Interest", x + w, y - 18);
  ctx.fillStyle = "#f5b342";
  ctx.fillText(compactMoney(state.totalInterest), x + w, y + h + 28);

  const splitY = y + h + 74;
  const principalW = w * clamp(first.principalPaid / firstTotal, 0, 1);
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  roundedRect(ctx, x, splitY, w, 18, 9);
  ctx.fill();
  ctx.fillStyle = "#e50914";
  roundedRect(ctx, x, splitY, principalW, 18, 9);
  ctx.fill();
  ctx.fillStyle = "#f5b342";
  roundedRect(ctx, x + principalW, splitY, w - principalW, 18, 9);
  ctx.fill();

  ctx.fillStyle = "#a8a8b3";
  ctx.font = "800 11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("First EMI composition", x, splitY - 12);
  ctx.textAlign = "right";
  ctx.fillText(`${percent((first.interest / firstTotal) * 100)} interest`, x + w, splitY - 12);
}

function drawTimeline() {
  const { ctx, width, height } = setupCanvas(timelineCanvas);
  ctx.clearRect(0, 0, width, height);

  const schedule = getSchedule();
  const pad = { left: 60, right: 28, top: 72, bottom: 44 };
  const chartW = Math.max(10, width - pad.left - pad.right);
  const chartH = Math.max(10, height - pad.top - pad.bottom);
  const maxBalance = Math.max(1, state.principal, ...schedule.map((row) => row.balance));

  ctx.strokeStyle = "rgba(255, 255, 255, 0.11)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#a8a8b3";
  ctx.font = "800 11px system-ui, sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= 3; i += 1) {
    const y = pad.top + (chartH * i) / 3;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(compactMoney((maxBalance * (3 - i)) / 3), pad.left - 8, y + 4);
  }

  const pointFor = (row, index) => {
    const denominator = Math.max(1, schedule.length - 1);
    return {
      x: pad.left + (chartW * index) / denominator,
      y: pad.top + chartH - (row.balance / maxBalance) * chartH
    };
  };

  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
  gradient.addColorStop(0, "rgba(229, 9, 20, 0.34)");
  gradient.addColorStop(1, "rgba(229, 9, 20, 0.02)");

  ctx.beginPath();
  schedule.forEach((row, index) => {
    const point = pointFor(row, index);
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.lineTo(pad.left + chartW, pad.top + chartH);
  ctx.lineTo(pad.left, pad.top + chartH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  schedule.forEach((row, index) => {
    const point = pointFor(row, index);
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = "#58d7ff";
  ctx.lineWidth = 3;
  ctx.stroke();

  drawMilestones(ctx, schedule, pointFor);

  if (hoverMonthIndex !== null && schedule[hoverMonthIndex]) {
    const row = schedule[hoverMonthIndex];
    const point = pointFor(row, hoverMonthIndex);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(point.x, pad.top);
    ctx.lineTo(point.x, pad.top + chartH);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
    showTooltip(point, row);
  }

  ctx.fillStyle = "#a8a8b3";
  ctx.font = "800 11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(state.moratoriumMonths > 0 ? "Borrowed" : "Month 1", pad.left, height - 17);
  ctx.textAlign = "right";
  ctx.fillText(durationLabel(schedule.length), width - pad.right, height - 17);
}

function drawMilestones(ctx, schedule, pointFor) {
  const levels = [
    [0.75, "25% paid"],
    [0.50, "50% paid"],
    [0.25, "75% paid"]
  ];

  ctx.font = "800 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  levels.forEach(([balanceRatio, label]) => {
    const index = schedule.findIndex((row) => row.balance <= state.principal * balanceRatio);
    if (index < 0) return;
    const point = pointFor(schedule[index], index);
    ctx.fillStyle = "#f5b342";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff8f0";
    ctx.fillText(label, point.x, Math.max(86, point.y - 12));
  });
}

function showTooltip(point, row) {
  chartTooltip.hidden = false;
  chartTooltip.style.left = `${Math.max(8, Math.min(point.x + 16, timelineCanvas.clientWidth - 235))}px`;
  chartTooltip.style.top = `${Math.max(58, point.y - 30)}px`;
  chartTooltip.innerHTML = `
    <strong>${durationLabel(row.month)}</strong>
    Balance: ${money(row.balance)}<br>
    Principal paid: ${money(row.cumulativePrincipal)}<br>
    Interest paid: ${money(row.cumulativeInterest)}
  `;
}

function hideTooltip() {
  chartTooltip.hidden = true;
}

function setRepaymentInput(field, value, cap, activeInput) {
  const item = repaymentInputs[field];
  const sliderCap = Math.min(cap, field === "prepayment" ? fields.monthlyEmi.sliderMax : 5000000);
  item.range.max = String(Math.max(0, Math.round(sliderCap)));
  item.range.value = String(Math.min(Math.round(value), Math.round(sliderCap)));
  if (activeInput !== item.input) item.input.value = formatAmount(value);
  item.cap.textContent = `Slider up to ${money(sliderCap)}. Type up to ${money(cap)}.`;
}

function renderRepayment() {
  const model = repaymentModel();
  const activeInput = document.activeElement;
  const openingPrincipal = openingPrincipalForCurrentPlan();

  setRepaymentInput("remainingPrincipal", repaymentState.remainingPrincipal, openingPrincipal, activeInput);
  setRepaymentInput("prepayment", repaymentState.prepayment, model.progress.remainingPrincipal, activeInput);
  setSliderPinnedStateForRepayment("remainingPrincipal", repaymentState.remainingPrincipal, Number(repaymentInputs.remainingPrincipal.range.max));
  setSliderPinnedStateForRepayment("prepayment", repaymentState.prepayment, Number(repaymentInputs.prepayment.range.max));

  if (activeInput !== repaymentInputs.maturityDate.input) {
    repaymentInputs.maturityDate.input.value = repaymentState.maturityDate;
  }
  document.getElementById("remainingPrincipalMetric").textContent = money(model.progress.remainingPrincipal);
  document.getElementById("remainingTenureMetric").textContent = durationLabel(model.baseline.months);
  document.getElementById("remainingInterestMetric").textContent = money(model.baseline.totalInterest);
  document.getElementById("newEmiMetric").textContent = money(model.reduceEmiValue);
  document.getElementById("tenureSavedMetric").textContent = durationLabel(model.tenureSavings.months);
  document.getElementById("currentMaturityMetric").textContent =
    formatDate(repaymentState.maturityDate);
  document.getElementById("tenureMaturityMetric").textContent =
    formatDate(addMonthsToIso(state.currentDate, model.reduceTenure.months));
  document.getElementById("emiMaturityMetric").textContent =
    formatDate(addMonthsToIso(state.currentDate, model.reduceEmi.months));

  const tenureWins = model.tenureSavings.interest >= model.emiSavings.interest;
  const meaningfulPrepay = model.prepayment > 0 && model.progress.remainingPrincipal > 0;
  document.getElementById("bestSavingMetric").textContent = meaningfulPrepay
    ? money(Math.max(model.tenureSavings.interest, model.emiSavings.interest))
    : "Enter prepayment";
  document.getElementById("recommendBadge").textContent = meaningfulPrepay
    ? (tenureWins ? "Best: Reduce Tenure" : "Best: Reduce EMI")
    : "Add prepayment";

  const tenureCard = document.getElementById("tenureOption");
  const emiCard = document.getElementById("emiOption");
  tenureCard.className = `strategy-card ${meaningfulPrepay && tenureWins ? "best" : "good"}`;
  emiCard.className = `strategy-card ${meaningfulPrepay && !tenureWins ? "best" : "caution"}`;
  document.getElementById("tenureOptionHeadline").textContent = meaningfulPrepay
    ? `${money(model.tenureSavings.interest)} saved`
    : "Keeps EMI fixed";
  document.getElementById("tenureOptionDetail").textContent =
    `EMI ${money(state.monthlyEmi)} | Balance after prepay ${money(model.postPrincipal)} | Tenure ${durationLabel(model.reduceTenure.months)}.`;
  document.getElementById("emiOptionHeadline").textContent = meaningfulPrepay
    ? `${money(model.emiSavings.emiDrop)} lower EMI`
    : "Keeps tenure fixed";
  document.getElementById("emiOptionDetail").textContent =
    `New EMI ${money(model.reduceEmiValue)} | Same target tenure ${durationLabel(model.reduceEmi.months)} | Interest saved ${money(model.emiSavings.interest)}.`;

  document.getElementById("repayStatus").textContent =
    `${money(model.progress.remainingPrincipal)} principal remaining | maturity ${formatDate(repaymentState.maturityDate)}`;
  drawRepaymentChart(model);
}

function renderClosure() {
  const model = repaymentModel();
  const closure = closureStrategyModel(model);
  const activeInput = document.activeElement;

  if (activeInput !== repaymentInputs.desiredClosureDate.input) {
    repaymentInputs.desiredClosureDate.input.value = state.desiredClosureDate;
  }

  document.getElementById("closurePrincipalMetric").textContent = money(model.postPrincipal);
  document.getElementById("closureTenureMetric").textContent = durationLabel(closure.targetMonths);
  document.getElementById("closureRequiredEmiMetric").textContent = money(closure.requiredEmi);
  document.getElementById("closureBestSavingMetric").textContent =
    closure.targetMonths > 0 ? money(closure.best.interestSaved) : "-";
  document.getElementById("closureStatus").textContent = `Current date: ${formatDate(state.currentDate)}`;
  document.getElementById("closureBadge").textContent =
    closure.targetMonths > 0
      ? `Best: ${closure.best.label} saves ${compactMoney(closure.best.interestSaved)}`
      : "Pick future date";

  const strategyCopy = {
    monthly: "Pay this extra at the start of every month.",
    weekly: "Pay this extra at the start of every week.",
    yearly: "Pay this extra at the start of every year.",
    lump: "Pay this once now before the next EMI."
  };
  const metricIds = {
    monthly: "targetMonthlyExtraMetric",
    weekly: "targetWeeklyExtraMetric",
    yearly: "targetYearlyExtraMetric",
    lump: "targetLumpMetric"
  };
  const detailIds = {
    monthly: "targetMonthlyExtraDetail",
    weekly: "targetWeeklyExtraDetail",
    yearly: "targetYearlyExtraDetail",
    lump: "targetLumpDetail"
  };
  const cardIds = {
    monthly: "monthlyStrategyCard",
    weekly: "weeklyStrategyCard",
    yearly: "yearlyStrategyCard",
    lump: "lumpStrategyCard"
  };

  closure.options.forEach((option) => {
    const card = document.getElementById(cardIds[option.key]);
    const isBest = option.key === closure.best.key && closure.targetMonths > 0;
    card.classList.toggle("best", isBest);
    card.classList.toggle("good", !isBest && option.interestSaved > 0);
    card.classList.toggle("caution", !isBest && option.interestSaved <= 0);
    const label = card.querySelector("span");
    if (label) label.textContent = isBest ? `Best: ${option.headline}` : option.headline;
    document.getElementById(metricIds[option.key]).textContent =
      closure.targetMonths > 0 ? money(option.amount) : "Pick date";
    document.getElementById(detailIds[option.key]).textContent = closure.targetMonths > 0
      ? `${strategyCopy[option.key]} Interest saved: ${money(option.interestSaved)}. Interest cost: ${money(option.totalInterest)}. Total extra: ${money(option.totalExtra)}.`
      : "Choose a future closure date to calculate this strategy.";
  });
  drawClosureChart(model, closure);
}

function setSliderPinnedStateForRepayment(key, value, max) {
  const card = document.querySelector(`[data-repay-key="${key}"]`);
  if (!card) return;
  card.classList.toggle("above-slider", value > max);
}

function handleRepaymentChange(key, value) {
  const parsed = parseAmount(value);
  if (key === "prepayment") {
    repaymentState.prepayment = parsed;
  } else if (key === "remainingPrincipal") {
    repaymentState.manualRemaining = true;
    repaymentState.remainingPrincipal = clamp(parsed, 0, openingPrincipalForCurrentPlan());
  } else {
    repaymentState[key] = parsed;
  }
  renderRepayment();
  renderClosure();
}

function handleRepaymentMaturityDate(value) {
  if (isRendering) return;
  repaymentState.manualMaturity = true;
  repaymentState.maturityDate = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? value
    : defaultRepaymentMaturityDate();
  renderRepayment();
  renderClosure();
}

function drawFittedText(ctx, text, x, y, maxWidth) {
  const value = String(text);
  if (ctx.measureText(value).width <= maxWidth) {
    ctx.fillText(value, x, y);
    return;
  }
  let shortened = value;
  while (shortened.length > 3 && ctx.measureText(`${shortened}...`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  ctx.fillText(`${shortened}...`, x, y);
}

function drawRepaymentChart(model) {
  const { ctx, width, height } = setupCanvas(repaymentChart);
  ctx.clearRect(0, 0, width, height);
  const compact = width < 620;
  const pad = {
    left: compact ? 24 : 34,
    right: compact ? 18 : 26,
    top: 78,
    bottom: 26
  };
  const labelW = compact ? 84 : 132;
  const gap = compact ? 12 : 24;
  const chartX = pad.left + labelW;
  const chartW = Math.max(10, width - chartX - pad.right);
  const laneW = Math.max(40, (chartW - gap) / 2);
  const laneA = chartX;
  const laneB = chartX + laneW + gap;
  const rowGap = compact ? 13 : 18;
  const rowH = Math.max(68, (height - pad.top - pad.bottom - rowGap * 2) / 3);
  const barH = compact ? 13 : 15;
  const rows = [
    {
      label: "Current Plan",
      interest: model.baseline.totalInterest,
      months: model.baseline.months,
      emi: state.monthlyEmi,
      color: "#ff4d57"
    },
    {
      label: "Reduce Tenure",
      interest: model.reduceTenure.totalInterest,
      months: model.reduceTenure.months,
      emi: state.monthlyEmi,
      color: "#37d67a"
    },
    {
      label: "Reduce EMI",
      interest: model.reduceEmi.totalInterest,
      months: model.reduceEmi.months,
      emi: model.reduceEmiValue,
      color: "#58d7ff"
    }
  ];
  const maxInterest = Math.max(1, ...rows.map((row) => row.interest));
  const maxMonths = Math.max(1, ...rows.map((row) => row.months));
  const tenureWins = model.tenureSavings.interest >= model.emiSavings.interest;
  const bestLabel = tenureWins ? "Reduce Tenure" : "Reduce EMI";

  ctx.fillStyle = "#a8a8b3";
  ctx.font = "900 11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Remaining interest", laneA, pad.top - 24);
  ctx.fillText("Remaining tenure", laneB, pad.top - 24);

  rows.forEach((row, index) => {
    const y = pad.top + index * (rowH + rowGap);
    const isBest = row.label === bestLabel && model.prepayment > 0;
    const interestRatio = clamp(row.interest / maxInterest, 0, 1);
    const monthRatio = clamp(row.months / maxMonths, 0, 1);

    if (isBest) {
      ctx.fillStyle = "rgba(55, 214, 122, 0.08)";
      roundedRect(ctx, pad.left, y - 12, width - pad.left - pad.right, rowH + 8, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(55, 214, 122, 0.42)";
      ctx.lineWidth = 1;
      roundedRect(ctx, pad.left, y - 12, width - pad.left - pad.right, rowH + 8, 12);
      ctx.stroke();
    }

    ctx.fillStyle = "#fff8f0";
    ctx.font = "900 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    drawFittedText(ctx, row.label, pad.left, y + 7, labelW - 10);
    ctx.fillStyle = row.color;
    ctx.font = "900 11px system-ui, sans-serif";
    drawFittedText(ctx, money(row.emi), pad.left, y + 27, labelW - 10);

    const interestY = y + 18;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundedRect(ctx, laneA, interestY, laneW, barH, 999);
    ctx.fill();
    ctx.fillStyle = row.color;
    roundedRect(ctx, laneA, interestY, Math.max(2, laneW * interestRatio), barH, 999);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 12px system-ui, sans-serif";
    drawFittedText(ctx, compactMoney(row.interest), laneA, interestY + 34, laneW);

    const tenureY = y + 18;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundedRect(ctx, laneB, tenureY, laneW, barH, 999);
    ctx.fill();
    ctx.fillStyle = row.label === "Current Plan" ? "#ff4d57" : row.color;
    roundedRect(ctx, laneB, tenureY, Math.max(2, laneW * monthRatio), barH, 999);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 12px system-ui, sans-serif";
    drawFittedText(ctx, durationLabel(row.months), laneB, tenureY + 34, laneW);
  });

  ctx.fillStyle = "#a8a8b3";
  ctx.font = "800 10px system-ui, sans-serif";
  ctx.textAlign = "left";
  const footer = model.prepayment > 0
    ? `Best signal: ${bestLabel} | Tenure saves ${money(model.tenureSavings.interest)} | EMI cut saves ${money(model.emiSavings.interest)}`
    : "Add a prepayment to compare the two strategies.";
  drawFittedText(ctx, footer, pad.left, height - 10, width - pad.left - pad.right);
}

function drawClosureChart(model, closure) {
  const { ctx, width, height } = setupCanvas(closureChart);
  ctx.clearRect(0, 0, width, height);
  const compact = width < 620;
  const pad = { left: compact ? 18 : 34, right: compact ? 16 : 26, top: 82, bottom: 38 };
  const labelW = compact ? 92 : 150;
  const chartX = pad.left + labelW;
  const chartW = Math.max(20, width - chartX - pad.right);
  const rows = closure.options || [];
  const maxSaved = Math.max(1, ...rows.map((row) => row.interestSaved));
  const maxInterest = Math.max(1, ...rows.map((row) => row.totalInterest));
  const rowGap = compact ? 10 : 14;
  const rowH = Math.max(compact ? 58 : 64, (height - pad.top - pad.bottom - rowGap * (rows.length - 1)) / Math.max(1, rows.length));
  const barH = compact ? 10 : 12;
  const laneGap = compact ? 8 : 16;
  const laneW = Math.max(42, (chartW - laneGap) / 2);
  const savedX = chartX;
  const costX = chartX + laneW + laneGap;

  ctx.fillStyle = "#a8a8b3";
  ctx.font = "900 11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Target: ${formatDate(state.desiredClosureDate)} | ${durationLabel(closure.targetMonths)}`, pad.left, pad.top - 32);

  if (closure.targetMonths <= 0 || rows.length === 0) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 17px system-ui, sans-serif";
    drawFittedText(ctx, "Pick a future closure date to compare strategies.", pad.left, pad.top + 45, width - pad.left - pad.right);
    return;
  }

  ctx.fillStyle = "#fff8f0";
  ctx.font = "900 12px system-ui, sans-serif";
  drawFittedText(ctx, "Interest saved", savedX, pad.top - 10, laneW);
  drawFittedText(ctx, "Interest cost", costX, pad.top - 10, laneW);

  rows.forEach((row, index) => {
    const y = pad.top + index * (rowH + rowGap);
    const isBest = row.key === closure.best.key;
    const savedRatio = clamp(row.interestSaved / maxSaved, 0, 1);
    const interestRatio = clamp(row.totalInterest / maxInterest, 0, 1);
    if (isBest) {
      ctx.fillStyle = "rgba(55, 214, 122, 0.10)";
      roundedRect(ctx, pad.left - 8, y - 11, width - pad.left - pad.right + 16, rowH + 10, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(55, 214, 122, 0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.fillStyle = "#fff8f0";
    ctx.font = "900 12px system-ui, sans-serif";
    drawFittedText(ctx, row.label, pad.left, y + 8, labelW - 10);
    ctx.fillStyle = row.color;
    ctx.font = "900 11px system-ui, sans-serif";
    drawFittedText(ctx, money(row.amount), pad.left, y + 29, labelW - 10);
    ctx.fillStyle = isBest ? "#37d67a" : "#a8a8b3";
    ctx.font = "900 10px system-ui, sans-serif";
    drawFittedText(ctx, isBest ? "BEST" : `Extra ${compactMoney(row.totalExtra)}`, pad.left, y + 49, labelW - 10);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundedRect(ctx, savedX, y + 4, laneW, barH, 999);
    ctx.fill();
    ctx.fillStyle = "#37d67a";
    roundedRect(ctx, savedX, y + 4, Math.max(2, laneW * savedRatio), barH, 999);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundedRect(ctx, costX, y + 4, laneW, barH, 999);
    ctx.fill();
    ctx.fillStyle = "#ff4d57";
    roundedRect(ctx, costX, y + 4, Math.max(2, laneW * interestRatio), barH, 999);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = compact ? "800 10px system-ui, sans-serif" : "900 12px system-ui, sans-serif";
    drawFittedText(ctx, compactMoney(row.interestSaved), savedX, y + 35, laneW);
    drawFittedText(ctx, compactMoney(row.totalInterest), costX, y + 35, laneW);
    ctx.fillStyle = "#a8a8b3";
    ctx.font = "800 10px system-ui, sans-serif";
    drawFittedText(ctx, `Total extra ${compactMoney(row.totalExtra)}`, savedX, y + 53, chartW);
  });

  ctx.fillStyle = "#a8a8b3";
  ctx.font = "800 10px system-ui, sans-serif";
  const baseText = closure.best.interestSaved > 0
    ? `Best option: ${closure.best.label} saves ${money(closure.best.interestSaved)} interest versus the current path.`
    : "Current path already meets or beats the target date, so extra payments do not add interest savings.";
  drawFittedText(ctx, baseText, pad.left, height - 10, width - pad.left - pad.right);
}

function render() {
  normalizeState();
  solveAutoField();
  renderInputs();
  renderSummary();
  drawMixChart();
  drawTimeline();
  renderRepayment();
  renderClosure();
}

Object.entries(fields).forEach(([key, field]) => {
  if (calculatedKeys.has(key)) return;
  field.range.addEventListener("input", (event) => handleValueChange(key, event.target.value));
  if (key !== "durationMonths") {
    field.input.addEventListener("input", (event) => handleValueChange(key, event.target.value));
    if (amountKeys.has(key) || key === "annualRate") {
      field.input.addEventListener("blur", () => render());
    }
  }
});

fields.durationMonths.input.addEventListener("input", handleDurationInput);
fields.durationMonths.monthInput.addEventListener("input", handleDurationInput);
calendarControls.borrowedDate.addEventListener("input", (event) => handleBorrowedDateChange(event.target.value));
calendarControls.currentDate.addEventListener("input", (event) => handleCurrentDateChange(event.target.value));
calendarControls.hasHoliday.addEventListener("change", (event) => handleHolidayToggle(event.target.value));
calendarControls.moratoriumRange.addEventListener("input", (event) => handleMoratoriumChange(event.target.value));
calendarControls.moratoriumYears.addEventListener("input", handleMoratoriumInput);
calendarControls.moratoriumMonths.addEventListener("input", handleMoratoriumInput);
calendarControls.holidayMode.addEventListener("change", (event) => handleHolidayModeChange(event.target.value));
calendarControls.holidayPrincipalRange.addEventListener("input", (event) => handleHolidayPrincipalChange(event.target.value));
calendarControls.holidayPrincipalInput.addEventListener("input", (event) => handleHolidayPrincipalChange(event.target.value));
calendarControls.holidayPrincipalInput.addEventListener("blur", () => render());
repaymentInputs.desiredClosureDate.input.addEventListener("input", (event) => handleDesiredClosureDate(event.target.value));

document.querySelectorAll("[data-auto]").forEach((button) => {
  button.addEventListener("click", () => setAutoKey(button.dataset.auto));
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach((tab) => tab.classList.toggle("active", tab === button));
    document.querySelectorAll(".dashboard-view").forEach((view) => {
      view.classList.toggle("active", view.id === button.dataset.view);
    });
    if (button.dataset.view === "plannerDashboard") {
      drawMixChart();
      drawTimeline();
    }
    if (button.dataset.view === "repaymentDashboard") renderRepayment();
    if (button.dataset.view === "closureDashboard") renderClosure();
  });
});

repaymentInputs.remainingPrincipal.range.addEventListener("input", (event) => handleRepaymentChange("remainingPrincipal", event.target.value));
repaymentInputs.remainingPrincipal.input.addEventListener("input", (event) => handleRepaymentChange("remainingPrincipal", event.target.value));
repaymentInputs.remainingPrincipal.input.addEventListener("blur", () => renderRepayment());
repaymentInputs.maturityDate.input.addEventListener("input", (event) => handleRepaymentMaturityDate(event.target.value));
repaymentInputs.prepayment.range.addEventListener("input", (event) => handleRepaymentChange("prepayment", event.target.value));
repaymentInputs.prepayment.input.addEventListener("input", (event) => handleRepaymentChange("prepayment", event.target.value));
repaymentInputs.prepayment.input.addEventListener("blur", () => renderRepayment());

window.addEventListener("resize", () => {
  drawMixChart();
  drawTimeline();
  renderRepayment();
  renderClosure();
});

timelineCanvas.addEventListener("mousemove", (event) => {
  const rect = timelineCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const padLeft = 60;
  const padRight = 28;
  const chartW = Math.max(10, rect.width - padLeft - padRight);
  const schedule = getSchedule();
  const ratio = clamp((x - padLeft) / chartW, 0, 1);
  hoverMonthIndex = Math.round(ratio * Math.max(0, schedule.length - 1));
  drawTimeline();
});

timelineCanvas.addEventListener("mouseleave", () => {
  hoverMonthIndex = null;
  hideTooltip();
  drawTimeline();
});

setupInfoButtons();
state.desiredClosureDate = isoFromDate(addMonthsToIso(state.currentDate, 60));
state.monthlyEmi = calculateEmi(state.principal, state.annualRate, state.durationMonths, state.moratoriumMonths);
updateCalculatedTotals();
render();
