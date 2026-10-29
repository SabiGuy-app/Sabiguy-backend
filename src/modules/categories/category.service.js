const repository = require("./category.repository");
const CATEGORY_CATALOG = require("../../shared/utils/constants/categoryCatalog");

const normalizeSlug = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const normalizeServices = (services = []) => services
  .filter((service) => service && String(service.name || service).trim())
  .map((service) => typeof service === "string"
    ? { id: normalizeSlug(service), name: service.trim() }
    : { id: normalizeSlug(service.id || service.name), name: String(service.name).trim() });

exports.seedCatalog = () => repository.upsertMany(CATEGORY_CATALOG.map((category) => ({
  slug: category.id,
  name: category.name,
  services: normalizeServices(category.services),
})));

exports.createCategory = async (body) => {
  if (!body || typeof body !== "object") throw new Error("Category payload is required");

  const name = body.name || body.category;
  if (!name || !String(name).trim()) throw new Error("Category name is required");

  const slug = normalizeSlug(body.slug || body.id || name);
  if (!slug) throw new Error("Category slug is required");

  const payload = {
    slug,
    name: String(name).trim(),
    services: normalizeServices(body.services || []),
  };

  const existing = await repository.findBySlug(slug);
  if (existing) {
    existing.name = payload.name;
    existing.services = payload.services;
    await existing.save();
    return existing;
  }

  return repository.create(payload);
};

exports.createFromPayload = async (body) => {
  const hasNoPayload = !body || Object.keys(body).length === 0;
  if (hasNoPayload) return { seeded: true, categories: await exports.seedCatalog() };
  if (Array.isArray(body.categories) || Array.isArray(body)) {
    const categories = body.categories || body;
    const normalized = categories.map((category) => ({
      slug: normalizeSlug(category.slug || category.id || category.name),
      name: String(category.name || category.category || "").trim(),
      services: normalizeServices(category.services || []),
    })).filter((category) => category.slug && category.name);
    return repository.upsertMany(normalized);
  }
  const category = await exports.createCategory(body);
  return [category];
};

exports.updateCategory = async (id, body) => {
  if (!body || typeof body !== "object") throw new Error("Category update payload is required");

  const updates = {};
  if (body.name !== undefined || body.category !== undefined) {
    const name = body.name !== undefined ? body.name : body.category;
    if (!String(name || "").trim()) throw new Error("Category name is required");
    updates.name = String(name).trim();
  }

  if (body.slug !== undefined || body.id !== undefined || updates.name) {
    const slugSource = body.slug !== undefined
      ? body.slug
      : body.id !== undefined
        ? body.id
        : updates.name;
    const slug = normalizeSlug(slugSource);
    if (!slug) throw new Error("Category slug is required");
    updates.slug = slug;
  }

  if (body.services !== undefined) {
    if (!Array.isArray(body.services)) throw new Error("Services must be an array");
    updates.services = normalizeServices(body.services);
  }

  if (Object.keys(updates).length === 0) throw new Error("No category fields provided to update");

  const category = await repository.updateById(id, updates);
  if (!category) {
    const error = new Error("Category not found");
    error.statusCode = 404;
    throw error;
  }
  return category;
};

exports.deleteCategory = async (id) => {
  const category = await repository.deleteById(id);
  if (!category) {
    const error = new Error("Category not found");
    error.statusCode = 404;
    throw error;
  }
  return category;
};

exports.getCategories = () => repository.findAll();
