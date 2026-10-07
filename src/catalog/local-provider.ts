import {
  validateComponentDefinition,
  type ComponentCatalogProvider,
  type ComponentCatalogQuery,
  type ComponentDefinition,
} from './model';

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchesQuery(component: ComponentDefinition, query: ComponentCatalogQuery) {
  if (query.category && component.category !== query.category) return false;
  if (query.manufacturer && normalize(component.manufacturer ?? '') !== normalize(query.manufacturer)) return false;
  if (query.tags?.length) {
    const componentTags = new Set((component.tags ?? []).map(normalize));
    if (!query.tags.every((tag) => componentTags.has(normalize(tag)))) return false;
  }
  if (query.text?.trim()) {
    const needle = normalize(query.text);
    const haystack = [
      component.name,
      component.manufacturer ?? '',
      component.partNumber ?? '',
      component.category,
      ...(component.tags ?? []),
    ].join(' ').toLocaleLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

export class LocalComponentCatalogProvider implements ComponentCatalogProvider {
  readonly kind = 'local' as const;
  readonly offlineAvailable = true;
  private readonly items: ComponentDefinition[];

  constructor(
    readonly id: string,
    readonly label: string,
    definitions: unknown[],
  ) {
    if (!id.trim()) throw new Error('Component catalog provider id must be non-empty.');
    if (!label.trim()) throw new Error('Component catalog provider label must be non-empty.');
    this.items = definitions.map(validateComponentDefinition);
    const stableKeys = this.items.map((item) => item.id + '@' + item.revision);
    if (new Set(stableKeys).size !== stableKeys.length) {
      throw new Error('Component catalog contains duplicate id@revision entries.');
    }
  }

  async search(query: ComponentCatalogQuery = {}) {
    return this.items.filter((item) => matchesQuery(item, query));
  }

  async get(componentId: string, revision?: string) {
    if (revision) return this.items.find((item) => item.id === componentId && item.revision === revision) ?? null;
    const matches = this.items.filter((item) => item.id === componentId);
    if (matches.length <= 1) return matches[0] ?? null;
    return [...matches].sort((a, b) => b.revision.localeCompare(a.revision))[0] ?? null;
  }
}

export function importLocalComponentCatalog(
  text: string,
  options: { providerId?: string; label?: string } = {},
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Component catalog file is not valid JSON.');
  }
  if (!Array.isArray(parsed)) throw new Error('Component catalog document must be a JSON array.');
  return new LocalComponentCatalogProvider(
    options.providerId ?? 'user-local',
    options.label ?? 'User local catalog',
    parsed,
  );
}
