export const COURSE_CATALOG = [];

export function courseById(id) {
  return COURSE_CATALOG.find((course) => course.id === id) || null;
}

export function pathKeyForCourse(courseId, courseName = '') {
  const id = String(courseId || '').toLowerCase();
  const name = String(courseName || '').toLowerCase();
  if (id.includes('design') || name.includes('design')) return 'design';
  if (id.includes('web') || id.includes('ai') || name.includes('web') || name.includes('ai')) return 'tech';
  return 'analytics';
}
