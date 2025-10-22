-- up
CREATE UNIQUE INDEX IF NOT EXISTS access_policies_resource_subject_unique
ON access_policies (
  resource_id,
  subject_type,
  coalesce(subject_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid),
  coalesce(role, '')
);

-- down
DROP INDEX IF EXISTS access_policies_resource_subject_unique;


