export const COURSE_CATALOG = [
  { id: 'data-analytics', name: 'Data Analytics in the Wild', price: 14900 },
  { id: 'web-dev', name: 'Modern Web Development', price: 16900 },
  { id: 'product-design', name: 'Product Design Foundations', price: 12900 },
  { id: 'business-analytics', name: 'Business Analytics', price: 9900 },
  { id: 'ai-for-work', name: 'AI for Work', price: 11900 },
];

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
