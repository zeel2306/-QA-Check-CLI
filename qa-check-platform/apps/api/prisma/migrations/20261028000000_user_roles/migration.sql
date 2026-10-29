-- Additive migration: existing users become DEVELOPER; sessions remain intact.
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DEVELOPER', 'QA');
ALTER TABLE "User" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'DEVELOPER';
