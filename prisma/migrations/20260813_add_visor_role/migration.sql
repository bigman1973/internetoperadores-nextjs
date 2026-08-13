-- Add VISOR to RolAdmin enum
ALTER TYPE "RolAdmin" ADD VALUE IF NOT EXISTS 'VISOR';

-- Change default for new users
ALTER TABLE "usuarios_admin" ALTER COLUMN "rol" SET DEFAULT 'VISOR';
