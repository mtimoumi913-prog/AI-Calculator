// script.js (استبدل كامل الملف بهذا)
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

  // المتغيرات محفوظة هنا لكل عملية Submit (تُعاد تهيئتها عند كل إرسال)
  const vars = {};

  // نقسم على " | " لتعامل كل جزء لوحده
  const parts = raw.split("|").map(p => p.trim()).filter(Boolean);

  parts.forEach((part, idx) => {
    const card = document.createElement('div');
    card.className = "expr-card";
    const title = document.createElement('h3');
    title.textContent = `التعبير ${idx+1}: ${part}`;
    card.appendChild(title);

    try {
      // هل هو تعيين متغير؟ الشكل: name = expr
      const assignMatch = part.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
      if (assignMatch) {
        const varNameRaw = assignMatch[1];
        const varKey = varNameRaw.toLowerCase(); // نخزن المفاتيح صغيرة
        const rhsRaw = assignMatch[2];

        // نظّف RHS مع السماح للحروف (لأنها قد تكون متغيرات أخرى)
        const rhsSafe = preprocess(rhsRaw);

        // استبدل المتغيرات الموجودة في RHS (إن وُجدت)
        const substituted = substituteVariables(rhsSafe, vars);

        // إذا تغيّر بعد الاستبدال نعرض خطوة الاستبدال
        const stepsList = [];
        if (substituted !== rhsSafe) {
          stepsList.push(`${varNameRaw} = ${rhsSafe} → ${varNameRaw} = ${substituted}`);
        } else {
          stepsList.push(`${varNameRaw} = ${rhsSafe}`);
        }

        // احسب RHS بعد الاستبدال وأحصل على خطواته
        const rhsResultObj = evaluateWithSteps(substituted);
        // أضف خطوات الحساب التي حصلت داخل RHS
        rhsResultObj.steps.forEach(s => stepsList.push(s));

        // سجِّل المتغير بالقيمة النهائية
        vars[varKey] = rhsResultObj.result;

        // خطوة التعيين النهائية
        stepsList.push(`${varNameRaw} = ${numToStr(rhsResultObj.result)}`);

        // عرض الخطوات داخل الكرت
        const ol = document.createElement('ol');
        stepsList.forEach(s => {
          const li = document.createElement('li');
          li.textContent = s;
          ol.appendChild(li);
        });
        card.appendChild(ol);

      } else {
        // ليس تعيينًا - تعبير عادي (نستبدل المتغيرات إن وُجدت ونحسب)
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

    // افصل بين التعابير
    stepsEl.appendChild(card);
  });

  // إظهار المتغيرات (اختياري) تحت النتائج
  const varsDiv = document.createElement('div');
  varsDiv.style.marginTop = "10px";
  varsDiv.innerHTML = `<strong>المتغيرات الحالية (للمدة الحالية):</strong> ${Object.keys(vars).length ? Object.entries(vars).map(([k,v])=>`${k}=${v}`).join(', ') : 'لا شيء'}`;
  stepsEl.appendChild(varsDiv);
}

/* ============================
   دوال التقييم (تتعامل مع أرقام فقط)
   تدعم: √  ^  * /  + -  والأقواس
   وتعيد قائمة خطوات تحويل التعبير حتى يصبح رقمًا واحدًا.
   ============================ */

function evaluateWithSteps(expr) {
  const steps = [];
  let current = stripSpaces(expr);

  // الأقواس
  const parenRegex = /\([^()]*\)/;
  while (parenRegex.test(current)) {
    current = current.replace(parenRegex, (group) => {
      const inside = group.slice(1, -1);
      const { result, steps: insideSteps } = evalNoParensWithSteps(inside);
      // أضف خطوات داخل القوس (مسبوقة بصيغة القوس الكامل)
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

  // الجذر √   (مثال: √9 أو √(9))
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

  // الأس ^
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

  // ضرب وقسمة (الأولوية)
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

  // جمع وطرح
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

/* ================
   أدوات المساعدة
   ================ */

function preprocess(s) {
  // نسمح: أرقام، حروف (لمتغيرات)، العمليات +-*/^() . √ والمسافات
  return s.replace(/[^0-9A-Za-z_\+\-\*\/\^\(\)\.\s√]/g, "");
}

function stripSpaces(s) { return s.replace(/\s+/g, ""); }

function substituteVariables(expr, vars) {
  // نبحث عن أي اسم متغير ونستبدله بقيمته (المفتاح في vars مخزن بصيغة صغيرة)
  return expr.replace(/[A-Za-z_]\w*/g, (name) => {
    const key = name.toLowerCase();
    if (!(key in vars)) throw new Error(`المتغير "${name}" غير معرف`);
    return numToStr(vars[key]);
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
