const inputEl  = document.getElementById('input');
const outputEl = document.getElementById('output');
const stepsEl  = document.getElementById('steps');

document.getElementById('submit').addEventListener('click', onCalc);

function onCalc() {
  const raw = (inputEl.value || "").trim();
  stepsEl.innerHTML = "";
  outputEl.innerHTML = "";

  if (!raw) {
    outputEl.innerHTML = "<strong>خطأ:</strong> الرجاء إدخال تعبير حسابي.";
    return;
  }

  // المتغيرات
  const vars = {};

  // نقسم على |
  const parts = raw.split("|").map(p => p.trim()).filter(Boolean);

  parts.forEach((part, idx) => {
    const card = document.createElement('div');
    card.className = "expr-card";
    const title = document.createElement('h3');
    title.textContent = `التعبير ${idx+1}: ${part}`;
    card.appendChild(title);

    try {
      // التحقق هل فيه =
      const eqMatch = part.match(/^(.+?)\s*=\s*(.+)$/);
      if (eqMatch) {
        const lhsRaw = eqMatch[1].trim(); // الجهة اليسرى (قد تكون متغير أو تعبير)
        const rhsRaw = eqMatch[2].trim();

        const rhsSafe = preprocess(rhsRaw);
        const substituted = substituteVariables(rhsSafe, vars);

        const stepsList = [];
        if (substituted !== rhsSafe) {
          stepsList.push(`${lhsRaw} = ${rhsSafe} → ${lhsRaw} = ${substituted}`);
        } else {
          stepsList.push(`${lhsRaw} = ${rhsSafe}`);
        }

        const rhsResultObj = evaluateWithSteps(substituted);
        rhsResultObj.steps.forEach(s => stepsList.push(s));

        // خزّن lhs كتعبير
        const lhsKey = stripSpaces(lhsRaw.toLowerCase());
        vars[lhsKey] = rhsResultObj.result;

        stepsList.push(`${lhsRaw} = ${numToStr(rhsResultObj.result)}`);

        const ol = document.createElement('ol');
        stepsList.forEach(s => {
          const li = document.createElement('li');
          li.textContent = s;
          ol.appendChild(li);
        });
        card.appendChild(ol);

      } else {
        // تعبير عادي
        const exprSafe = preprocess(part);
        const substituted = substituteVariables(exprSafe, vars);
        const stepsList = [];

        if (substituted !== exprSafe) {
          stepsList.push(`${exprSafe} → ${substituted}`);
        }

        const resObj = evaluateWithSteps(substituted);
        resObj.steps.forEach(s => stepsList.push(s));
        stepsList.push(`الناتج النهائي: ${numToStr(resObj.result)}`);

        const ol = document.createElement('ol');
        stepsList.forEach(s => {
          const li = document.createElement('li');
          li.textContent = s;
          ol.appendChild(li);
        });
        card.appendChild(ol);
      }

    } catch (err) {
      const errDiv = document.createElement('div');
      errDiv.className = "error";
      errDiv.innerHTML = `<strong>خطأ في التعبير ${idx+1}:</strong> ${err.message || "غير صالح"}`;
      card.appendChild(errDiv);
    }

    stepsEl.appendChild(card);
  });

  // إظهار المتغيرات
  const varsDiv = document.createElement('div');
  varsDiv.style.marginTop = "10px";
  varsDiv.innerHTML = `<strong>المتغيرات الحالية:</strong> ${
    Object.keys(vars).length ? Object.entries(vars).map(([k,v])=>`${k}=${v}`).join(', ') : 'لا شيء'
  }`;
  stepsEl.appendChild(varsDiv);
}

/* ======== أدوات ======== */
function preprocess(s) {
  return s.replace(/[^0-9A-Za-z_\+\-\*\/\^\(\)\.\s√]/g, "");
}
function stripSpaces(s) { return s.replace(/\s+/g, ""); }

function substituteVariables(expr, vars) {
  let e = expr;
  // أولاً: إذا كان التعبير كاملاً مخزن (مثل a+b)
  const key = stripSpaces(expr.toLowerCase());
  if (vars[key] !== undefined) {
    return numToStr(vars[key]);
  }
  // ثانيًا: استبدال المتغيرات المفردة
  return e.replace(/[A-Za-z_]\w*/g, (name) => {
    const k = name.toLowerCase();
    if (!(k in vars)) throw new Error(`المتغير "${name}" غير معرف`);
    return numToStr(vars[k]);
  });
}

function numToStr(n) {
  const rounded = Math.round(n * 1e12) / 1e12;
  return rounded.toString();
}

function normalizeSigns(s) {
  let prev;
  do {
    prev = s;
    s = s
      .replace(/\+\+/g, '+')
      .replace(/--/g, '+')
      .replace(/\+-/g, '-')
      .replace(/-\+/g, '-')
      .replace(/(^|\()(\+)/g, '$1');
  } while (s !== prev);
  return s;
}

/* ======== التقييم مع الخطوات ======== */
function evaluateWithSteps(expr) {
  const steps = [];
  let current = stripSpaces(expr);

  // أقواس
  const parenRegex = /\([^()]*\)/;
  while (parenRegex.test(current)) {
    current = current.replace(parenRegex, (group) => {
      const inside = group.slice(1, -1);
      const { result, steps: insideSteps } = evalNoParensWithSteps(inside);
      insideSteps.forEach(s => steps.push(s));
      const next = current.replace(group, numToStr(result));
      steps.push(`${current} → ${next}`);
      return numToStr(result);
    });
    current = normalizeSigns(current);
  }

  const finalObj = evalNoParensWithSteps(current);
  finalObj.steps.forEach(s => steps.push(s));
  return { result: finalObj.result, steps };
}

function evalNoParensWithSteps(raw) {
  let expr = normalizeSigns(stripSpaces(raw));
  const steps = [];

  // √
  let rootRegex = /√(-?\d+(?:\.\d+)?)/;
  while (rootRegex.test(expr)) {
    expr = expr.replace(rootRegex, (match, a, offset, full) => {
      const r = Math.sqrt(+a);
      const newExpr = full.slice(0, offset) + numToStr(r) + full.slice(offset + match.length);
      steps.push(`${full} → ${newExpr}`);
      return numToStr(r);
    });
    expr = normalizeSigns(expr);
  }

  // ^
  let powRegex = /(-?\d+(?:\.\d+)?)\^(-?\d+(?:\.\d+)?)/;
  while (powRegex.test(expr)) {
    expr = expr.replace(powRegex, (match, a, b, offset, full) => {
      const r = Math.pow(+a, +b);
      const newExpr = full.slice(0, offset) + numToStr(r) + full.slice(offset + match.length);
      steps.push(`${full} → ${newExpr}`);
      return numToStr(r);
    });
    expr = normalizeSigns(expr);
  }

  // * /
  let md = /(-?\d+(?:\.\d+)?)([*\/])(-?\d+(?:\.\d+)?)/;
  while (md.test(expr)) {
    expr = expr.replace(md, (match, a, op, b, offset, full) => {
      const r = op === '*' ? (+a) * (+b) : (+a) / (+b);
      const newExpr = full.slice(0, offset) + numToStr(r) + full.slice(offset + match.length);
      steps.push(`${full} → ${newExpr}`);
      return numToStr(r);
    });
    expr = normalizeSigns(expr);
  }

  // + -
  let as = /(-?\d+(?:\.\d+)?)([+\-])(-?\d+(?:\.\d+)?)/;
  while (as.test(expr)) {
    expr = expr.replace(as, (match, a, op, b, offset, full) => {
      const r = op === '+' ? (+a) + (+b) : (+a) - (+b);
      const newExpr = full.slice(0, offset) + numToStr(r) + full.slice(offset + match.length);
      steps.push(`${full} → ${newExpr}`);
      return numToStr(r);
    });
    expr = normalizeSigns(expr);
  }

  const val = parseFloat(expr);
  if (!isFinite(val)) throw new Error("نتيجة غير عددية أو قسمة على صفر");
  return { result: val, steps };
}
