import { Request, Response, NextFunction } from 'express';

const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction): void => {
  const timestamp = new Date().toISOString();
  console.error(`[ERROR] ${timestamp} -`, err?.message || err, err?.stack ? { stack: err.stack } : '');

  const isProduction = process.env.NODE_ENV === 'production';

  res.status(err.status || 500).json({
    success: false,
    error: isProduction ? 'Une erreur interne est survenue. Veuillez réessayer.' : (err.message || 'Erreur serveur'),
  });
};

export default errorHandler;
