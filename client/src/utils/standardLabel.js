export const formatStandardLabel = (standardOrCode, name, description) => {
  let code = null;
  let desc = null;

  if (standardOrCode && typeof standardOrCode === 'object') {
    code = standardOrCode.code ?? null;
    desc =
      standardOrCode.description ??
      standardOrCode.name ??
      null;
  } else {
    code = standardOrCode ?? null;
    desc = description ?? name ?? null;
  }

  if (code && desc) {
    return `${code} : ${desc}`;
  }

  if (code) return code;
  if (desc) return desc;
  return '';
};

