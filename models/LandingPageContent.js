import mongoose from 'mongoose';
import { LANDING_CONTENT_KEY } from '../config/landingPageDefaults.js';

const landingPageContentSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: LANDING_CONTENT_KEY,
      unique: true,
      immutable: true,
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// unique: true on the field definition above already creates this index

const LandingPageContent = mongoose.model('LandingPageContent', landingPageContentSchema);

export default LandingPageContent;

