import mongoose from "mongoose";
import dotenv from "dotenv";
import PresentationTemplate from "../models/PresentationTemplate.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/gradebook";

const templates = [
  {
    name: "Standard Lesson",
    description:
      "A complete lesson presentation with opener, objectives, content, activity, and summary.",
    isGlobal: true,
    isActive: true,
    slideStructure: [
      {
        layout: "title",
        purpose: "Title slide with lesson name and date",
        promptHint: "Engaging title, subtitle with subject and date",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "Learning objectives",
        promptHint:
          "List 2-4 clear learning objectives using student-friendly language",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "Warm-up / Do Now",
        promptHint:
          "Quick engagement activity or review question to activate prior knowledge",
        required: false,
      },
      {
        layout: "title-body",
        purpose: "Key vocabulary",
        promptHint: "Define 3-5 essential terms with simple explanations",
        required: false,
      },
      {
        layout: "two-column",
        purpose: "Core concept introduction",
        promptHint:
          "Explain the main concept with examples; use two columns for concept vs. example",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "Guided practice",
        promptHint:
          "Worked example or step-by-step walkthrough of a problem",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "Independent / group activity",
        promptHint:
          "Activity instructions with clear steps and expected outcomes",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "Check for understanding",
        promptHint:
          "2-3 quick assessment questions or discussion prompts",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "Summary and takeaways",
        promptHint:
          "Recap the key points; connect back to learning objectives",
        required: true,
      },
      {
        layout: "title",
        purpose: "Closing slide",
        promptHint:
          "Homework or next steps; encouraging closing message",
        required: false,
      },
    ],
    defaultTheme: {
      primaryColor: "#1a73e8",
      secondaryColor: "#174ea6",
      fontFamily: "Segoe UI, Roboto, Arial, sans-serif",
    },
  },
  {
    name: "Quick Review",
    description:
      "A short 5-slide review presentation for recapping a topic or preparing for assessments.",
    isGlobal: true,
    isActive: true,
    slideStructure: [
      {
        layout: "title",
        purpose: "Title and topic overview",
        promptHint: "Topic name and what will be reviewed",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "Key concepts recap",
        promptHint: "Summarize the most important ideas in bullet points",
        required: true,
      },
      {
        layout: "comparison",
        purpose: "Compare and contrast or common mistakes",
        promptHint:
          "Show correct vs. incorrect approaches or compare two related concepts",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "Practice questions",
        promptHint: "3-4 review questions at increasing difficulty",
        required: true,
      },
      {
        layout: "title",
        purpose: "Wrap-up",
        promptHint:
          "Key takeaway message and study tips",
        required: true,
      },
    ],
    defaultTheme: {
      primaryColor: "#0d47a1",
      secondaryColor: "#1565c0",
      fontFamily: "Segoe UI, Roboto, Arial, sans-serif",
    },
  },
];

const seedPresentationTemplates = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    for (const tmpl of templates) {
      const existing = await PresentationTemplate.findOne({
        name: tmpl.name,
        isGlobal: true,
      }).setOptions({ skipTenantFilter: true });

      if (existing) {
        console.log(`Template "${tmpl.name}" already exists — skipping`);
        continue;
      }

      await PresentationTemplate.create(tmpl);
      console.log(`Created template: "${tmpl.name}"`);
    }

    console.log("Done seeding presentation templates");
    await mongoose.disconnect();
  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  }
};

seedPresentationTemplates();
