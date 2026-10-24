import mongoose from 'mongoose';

// One authored definition per objective type, shared by every question and attempt schema so a
// CSV column, a pool edit and a student response all mean the same thing.

export const matchingPairSchema = new mongoose.Schema(
  {
    left: { type: String, required: true, trim: true, maxlength: 600 },
    right: { type: String, required: true, trim: true, maxlength: 1200 },
  },
  { _id: false },
);

export const orderingItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true, maxlength: 40 },
    text: { type: String, required: true, trim: true, maxlength: 1200 },
  },
  { _id: false },
);

export const blankSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true, maxlength: 40 },
    accepts: { type: [String], default: [] },
    caseSensitive: { type: Boolean, default: false },
  },
  { _id: false },
);

export const numericRuleSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['exact', 'tolerance', 'relative', 'range'], default: 'exact' },
    value: { type: String, default: '', trim: true, maxlength: 60 },
    min: { type: String, default: '', trim: true, maxlength: 60 },
    max: { type: String, default: '', trim: true, maxlength: 60 },
    tolerance: { type: String, default: '', trim: true, maxlength: 60 },
    unit: { type: String, default: '', trim: true, maxlength: 40 },
    decimalPlaces: { type: String, default: '', trim: true, maxlength: 8 },
    allowFractions: { type: Boolean, default: false },
    allowPercent: { type: Boolean, default: false },
  },
  { _id: false },
);

export const objectiveAnswerDefinitionSchemas = {
  matchingPairs: [matchingPairSchema],
  orderingItems: [orderingItemSchema],
  blanks: [blankSchema],
  numericRule: { type: numericRuleSchema, default: null },
};
