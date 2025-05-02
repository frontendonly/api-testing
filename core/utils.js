/*** 
 * @param {*} key 
 * @param {*} context 
 * @returns 
 */
export function getContext(key, context) {
    if (typeof key == 'string' && key.startsWith('$.')) {
        key = key.substring(2);
        return key.split('.').reduce((accum, k) => {
            return (accum !== null && typeof accum == 'object') ? accum[k] : accum;
        }, context);
    }
    return key;
}

/**
 * 
 * @param {*} str 
 * @param {*} context 
 * @returns 
 */
export function withContext(str, context) {
    if (typeof str !== 'string') return str;
    return str.replaceAll(/\%(.*?)\%/mg, (a, b) => getContext(b, context))
}

/**
 * 
 * @param {*} expression 
 * @param {*} contextA 
 * @param {*} contextB 
 * @returns 
 */
export function evaluateExpression(expression, contextA, contextB) {
    const operators = {
        gt: (a, b) => a > b,
        lt: (a, b) => a < b,
        eq: (a, b) => a == b,
        not: (a, b) => a != b,
        gte: (a, b) => a >= b,
        lte: (a, b) => a <= b,
        def: (a, b) => a !== undefined,
        notdef: (a, b) => a == undefined
    };
    const a = getContext(expression.key, contextA);
    const ops = expression.operator || 'eq';
    let b = expression.value;
    if (typeof b == 'string' && b.startsWith('$.')) {
        b = getContext(b, contextB);
    }
    return operators[ops](a, b);
}

/**
 * 
 * @param {*} expressions 
 * @param {*} contextA 
 * @param {*} contextB 
 * @returns 
 */
export function evaluateExpressions(expressions, contextA, contextB) {
    if (!Array.isArray(expressions)) return true;
    let passed = true;
    for (const expression of expressions) {
        if (evaluateExpression(expression.key, contextA, contextB)) {
            passed = false;
            break;
        }
    }
    return passed;
}