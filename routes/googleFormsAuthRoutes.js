import express from 'express';
import { googleFormsOAuthCallback } from '../controllers/googleFormsController.js';

const router = express.Router();

router.get('/callback', googleFormsOAuthCallback);

export default router;
