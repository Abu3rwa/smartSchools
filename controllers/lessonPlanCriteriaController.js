import LessonPlanCriteria from '../models/LessonPlanCriteria.js';

export const createCriteria = async (req, res) => {
  try {
    const { name, description, weight, minScore, isRequired, evaluationPrompt } = req.body;
    const schoolId = req.user.school;

    const existingCount = await LessonPlanCriteria.countDocuments({ 
      school: schoolId, 
      isActive: true 
    });

    const criteria = new LessonPlanCriteria({
      school: schoolId,
      name,
      description,
      weight,
      minScore,
      isRequired,
      evaluationPrompt,
      order: existingCount,
      createdBy: req.user._id
    });

    await criteria.save();
    res.status(201).json(criteria);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A criterion with this name already exists for your school' });
    }
    res.status(500).json({ message: 'Error creating criteria', error: error.message });
  }
};

export const getCriteria = async (req, res) => {
  try {
    const schoolId = req.user.school;
    const { includeInactive } = req.query;

    const filter = { school: schoolId };
    if (!includeInactive) {
      filter.isActive = true;
    }

    const criteria = await LessonPlanCriteria.find(filter)
      .sort({ order: 1 })
      .populate('createdBy', 'name email');

    res.json(criteria);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching criteria', error: error.message });
  }
};

export const getCriteriaById = async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.user.school;

    const criteria = await LessonPlanCriteria.findOne({ 
      _id: id, 
      school: schoolId 
    }).populate('createdBy', 'name email');

    if (!criteria) {
      return res.status(404).json({ message: 'Criteria not found' });
    }

    res.json(criteria);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching criteria', error: error.message });
  }
};

export const updateCriteria = async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.user.school;
    const { name, description, weight, minScore, isRequired, evaluationPrompt, isActive } = req.body;

    const criteria = await LessonPlanCriteria.findOne({ 
      _id: id, 
      school: schoolId 
    });

    if (!criteria) {
      return res.status(404).json({ message: 'Criteria not found' });
    }

    if (name) criteria.name = name;
    if (description !== undefined) criteria.description = description;
    if (weight !== undefined) criteria.weight = weight;
    if (minScore !== undefined) criteria.minScore = minScore;
    if (isRequired !== undefined) criteria.isRequired = isRequired;
    if (evaluationPrompt !== undefined) criteria.evaluationPrompt = evaluationPrompt;
    if (isActive !== undefined) criteria.isActive = isActive;

    await criteria.save();
    res.json(criteria);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A criterion with this name already exists for your school' });
    }
    res.status(500).json({ message: 'Error updating criteria', error: error.message });
  }
};

export const deleteCriteria = async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.user.school;

    const criteria = await LessonPlanCriteria.findOne({ 
      _id: id, 
      school: schoolId 
    });

    if (!criteria) {
      return res.status(404).json({ message: 'Criteria not found' });
    }

    criteria.isActive = false;
    await criteria.save();

    res.json({ message: 'Criteria deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting criteria', error: error.message });
  }
};

export const reorderCriteria = async (req, res) => {
  try {
    const { criteriaIds } = req.body;
    const schoolId = req.user.school;

    if (!Array.isArray(criteriaIds)) {
      return res.status(400).json({ message: 'criteriaIds must be an array' });
    }

    const updatePromises = criteriaIds.map((id, index) => 
      LessonPlanCriteria.updateOne(
        { _id: id, school: schoolId },
        { order: index }
      )
    );

    await Promise.all(updatePromises);

    res.json({ message: 'Criteria reordered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error reordering criteria', error: error.message });
  }
};

export const initializeDefaultCriteria = async (req, res) => {
  try {
    const schoolId = req.user.school;

    const existingCount = await LessonPlanCriteria.countDocuments({ 
      school: schoolId, 
      isActive: true 
    });

    if (existingCount > 0) {
      return res.status(400).json({ message: 'Default criteria already exist for this school' });
    }

    const defaultCriteria = [
      {
        name: 'Learning Objectives',
        description: 'Clear, measurable, and aligned with curriculum standards',
        weight: 5,
        minScore: 70,
        isRequired: true,
        evaluationPrompt: 'Evaluate if the learning objectives are specific, measurable, achievable, relevant, and time-bound (SMART). Check alignment with curriculum standards.',
        order: 0
      },
      {
        name: 'Instructional Activities',
        description: 'Engaging, varied, and aligned with objectives',
        weight: 4,
        minScore: 65,
        isRequired: true,
        evaluationPrompt: 'Assess the variety and engagement level of activities. Check if activities directly support the learning objectives and include active learning strategies.',
        order: 1
      },
      {
        name: 'Assessment Methods',
        description: 'Appropriate for objectives and provide meaningful feedback',
        weight: 4,
        minScore: 65,
        isRequired: true,
        evaluationPrompt: 'Evaluate if assessment methods align with learning objectives and provide opportunities for formative and summative assessment. Check for clear success criteria.',
        order: 2
      },
      {
        name: 'Differentiation',
        description: 'Addresses diverse learning needs and abilities',
        weight: 3,
        minScore: 60,
        isRequired: true,
        evaluationPrompt: 'Check for strategies to support different learning styles, abilities, and needs. Look for scaffolding, extensions, and accommodations.',
        order: 3
      },
      {
        name: 'Resources and Materials',
        description: 'Appropriate and accessible resources listed',
        weight: 2,
        minScore: 60,
        isRequired: true,
        evaluationPrompt: 'Verify that all necessary resources and materials are listed and are appropriate for the lesson. Check for accessibility and availability.',
        order: 4
      },
      {
        name: 'Time Management',
        description: 'Realistic pacing and time allocation',
        weight: 2,
        minScore: 60,
        isRequired: true,
        evaluationPrompt: 'Assess if the lesson has realistic time allocations for each activity and includes buffer time for transitions and questions.',
        order: 5
      }
    ];

    const criteriaToCreate = defaultCriteria.map(c => ({
      ...c,
      school: schoolId,
      createdBy: req.user._id
    }));

    const created = await LessonPlanCriteria.insertMany(criteriaToCreate);

    res.status(201).json({ 
      message: 'Default criteria initialized successfully', 
      count: created.length,
      criteria: created
    });
  } catch (error) {
    res.status(500).json({ message: 'Error initializing default criteria', error: error.message });
  }
};
