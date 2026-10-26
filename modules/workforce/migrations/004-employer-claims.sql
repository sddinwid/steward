-- A participant cannot consume multiple openings for the same position through
-- distinct referral identifiers. Human withdrawal/rejection releases the claim.
CREATE UNIQUE INDEX workforce_private_job_unique
ON business_records((data->>'positionId'),(data->>'participantAlias'))
WHERE kind='mission-employer-referral' AND data->>'status' IN ('requested','reviewed','accepted');
