from datetime import datetime
from typing import Any, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, field_validator, model_validator


class Closed(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class SourceReference(Closed):
    entityId: UUID
    recordId: UUID
    moduleId: str = Field(min_length=1, max_length=80, pattern=r'^[a-z][a-z0-9.-]+$')
    streamId: str = Field(min_length=1, max_length=50, pattern=r'^[a-z][a-z0-9_]+$')
    revision: int = Field(strict=True, ge=1, le=2**53-1)


class ScientificEvidenceReference(Closed):
    schemaVersion: Literal[1]
    jobId: UUID
    datasetId: UUID
    inputDigest: str = Field(pattern=r'^[a-f0-9]{64}$')


class Provenance(Closed):
    datasetId: UUID
    synthetic: bool
    basis: Literal['authorized-synchronized-projection', 'synthetic-analytical-history']
    asOf: datetime
    references: list[SourceReference] = Field(max_length=256)
    derivedFrom: list[ScientificEvidenceReference] = Field(default_factory=list, max_length=4)

    @field_validator('asOf')
    @classmethod
    def timezone_required(cls, value):
        if value.tzinfo is None:
            raise ValueError('Timezone required')
        return value

    @model_validator(mode='after')
    def synthetic_history(self):
        if self.basis == 'synthetic-analytical-history' and not self.synthetic:
            raise ValueError('Analytical synthetic history cannot be labeled operational')
        if any(r.datasetId != self.datasetId for r in self.derivedFrom) or len({r.jobId for r in self.derivedFrom}) != len(self.derivedFrom):
            raise ValueError('Invalid scientific derivation chain')
        return self


class Request(Closed):
    schemaVersion: Literal[1]
    jobId: UUID
    capability: Literal['describe-series', 'demand-forecast', 'procurement-optimization', 'scenario-comparison', 'mission-sustainability']
    principalId: UUID
    entityIds: list[UUID] = Field(min_length=1, max_length=8)
    provenance: Provenance
    parameters: dict[str, Any]
    executionMillis: int = Field(strict=True, ge=100, le=12000, default=6000)

    @model_validator(mode='after')
    def reference_scope(self):
        if len(set(self.entityIds)) != len(self.entityIds):
            raise ValueError('Duplicate entity scope')
        if any(r.entityId not in self.entityIds for r in self.provenance.references):
            raise ValueError('Source reference outside authorized scope')
        if self.capability == 'demand-forecast':
            rows = self.parameters.get('series', [])
            if not isinstance(rows, list) or len(rows) > 8 or any(not isinstance(row, dict) or str(row.get('entityId', '')).lower() not in {str(i) for i in self.entityIds} for row in rows):
                raise ValueError('Demand series outside authorized scope')
        if self.capability in ('procurement-optimization', 'scenario-comparison'):
            problem = self.parameters.get('baseline', {}) if self.capability == 'scenario-comparison' else self.parameters
            for collection in ('entities', 'requirements'):
                rows = problem.get(collection, []) if isinstance(problem, dict) else None
                if not isinstance(rows, list) or any(not isinstance(row, dict) or str(row.get('entityId', '')).lower() not in {str(i) for i in self.entityIds} for row in rows):
                    raise ValueError('Purchasing input outside authorized scope')
        return self


class DescribeInput(Closed):
    values: list[StrictFloat | None] = Field(min_length=1, max_length=4096)

    @field_validator('values')
    @classmethod
    def bounded_values(cls, values):
        if any(v is not None and abs(v) > 1e9 for v in values):
            raise ValueError('Observation bound exceeded')
        return values
