export const calculateAgeMonthFromDate = (birthDate) => {
  if (!birthDate) {
    return null;
  }

  const date =
    typeof birthDate?.toDate === 'function' ? birthDate.toDate() : new Date(birthDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const now = new Date();
  const months =
    (now.getFullYear() - date.getFullYear()) * 12 +
    (now.getMonth() - date.getMonth()) -
    (now.getDate() < date.getDate() ? 1 : 0);

  return Math.max(0, months);
};

export const getMvpChildStage = ({ type, ageMonth }) => {
  if (type === 'pregnancy') {
    return 'pregnancy';
  }
  if (typeof ageMonth !== 'number') {
    return null;
  }
  if (ageMonth <= 2) {
    return 'newborn';
  }
  if (ageMonth <= 5) {
    return 'early_infant';
  }
  if (ageMonth <= 11) {
    return 'infant';
  }
  if (ageMonth <= 23) {
    return 'toddler';
  }
  if (ageMonth <= 36) {
    return 'early_child';
  }
  return 'child';
};

export const deriveCategoryTags = ({ stage, feedingType }) => {
  const tags = new Set();

  if (stage === 'pregnancy') {
    tags.add('feeding');
    tags.add('general');
  } else if (stage === 'newborn') {
    tags.add('feeding');
    tags.add('diaper');
    tags.add('bath');
  } else if (stage === 'early_infant' || stage === 'infant') {
    tags.add('feeding');
    tags.add('diaper');
    tags.add('play');
  } else if (stage === 'toddler') {
    tags.add('diaper');
    tags.add('play');
    tags.add('outing');
  } else if (stage === 'early_child') {
    tags.add('play');
    tags.add('outing');
  } else if (stage === 'child') {
    tags.add('play');
    tags.add('general');
  }

  if (feedingType === 'breast' || feedingType === 'formula' || feedingType === 'mixed') {
    tags.add('feeding');
  }

  return [...tags];
};

export const buildChildComputedFields = ({ type, birthDate }) => {
  if (type === 'pregnancy') {
    return {
      ageMonth: null,
      stage: 'pregnancy',
    };
  }

  const ageMonth = calculateAgeMonthFromDate(birthDate);
  return {
    ageMonth,
    stage: getMvpChildStage({ type: 'child', ageMonth }),
  };
};
