export const CATEGORIES = [
  'Kubernetes',
  'CI/CD',
  'Databases',
  'Networking',
  'Career',
  'Security',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Convert category name → URL-safe slug */
export function categoryToSlug(category: Category): string {
  return category.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
}

/** Convert URL slug → category name (or undefined if invalid) */
export function slugToCategory(slug: string): Category | undefined {
  return CATEGORIES.find((c) => categoryToSlug(c) === slug);
}

/** A consistent accent colour for each category */
export const CATEGORY_COLORS: Record<Category, string> = {
  Kubernetes: '#326ce5',
  'CI/CD': '#f97316',
  Databases: '#16a34a',
  Networking: '#7c3aed',
  Career: '#db2777',
  Security: '#dc2626',
};
