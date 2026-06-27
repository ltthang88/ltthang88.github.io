export const CATEGORIES = [
  'Kubernetes',
  'CI/CD',
  'Networking',
  'Career',
  'Security',
  'Observability',
  'Platform',
  'AI Engineering',
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
  Networking: '#7c3aed',
  Career: '#db2777',
  Security: '#dc2626',
  Observability: '#0891b2',
  Platform: '#d97706',
  'AI Engineering': '#4f46e5',
};
