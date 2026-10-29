const Category = require("./category.model");

exports.upsertMany = async (categories) => {
  const operations = categories.map((category) => ({
    updateOne: {
      filter: { slug: category.slug },
      update: { $set: category },
      upsert: true,
    },
  }));
  await Category.bulkWrite(operations);
  return Category.find().sort({ name: 1 }).lean();
};

exports.findBySlug = (slug) => Category.findOne({ slug });

exports.create = (category) => Category.create(category);

exports.findAll = () => Category.find().sort({ name: 1 }).lean();

exports.findById = (id) => Category.findById(id);

exports.updateById = (id, updates) => Category.findByIdAndUpdate(id, updates, {
  new: true,
  runValidators: true,
});

exports.deleteById = (id) => Category.findByIdAndDelete(id);
