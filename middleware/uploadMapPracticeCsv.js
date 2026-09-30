import multer from 'multer';
import path from 'path';

const allowedExtensions = new Set(['.csv']);

export const uploadMapPracticeCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 30 },
  fileFilter: (req, file, callback) => {
    void req;
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    const allowedMime = [
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/octet-stream',
      'text/plain',
      ''
    ];

    if (allowedExtensions.has(extension) && allowedMime.includes(file.mimetype)) {
      callback(null, true);
      return;
    }

    callback(new Error('Only CSV files are allowed for MAP practice import.'));
  }
});
