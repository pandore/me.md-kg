# Fact Extraction Prompt

Extract entity-relation-entity triples from text about a person.

## Output Format
JSON array of objects with:
- source_entity: { name, type }
- relation_type: snake_case verb
- target_entity: { name, type }
- summary: natural language description
- confidence: 0.0-1.0
- valid_from: ISO date (optional)

## Entity Types
person, organization, place, concept, service, product, event, skill, value, trait, preference, doctor, contact

## Relation Types
works_at, lives_in, prefers, values, knows, uses, has_skill, has_role, manages, created, member_of, has_doctor, has_property, speaks, expert_in, founded, subscribes, born_in, moved_to, believes, has_fact, has_contact, has_nationality, has_name, has_context

## Confidence Scoring
- 0.9-1.0: Explicitly stated
- 0.7-0.89: Strongly implied
- 0.5-0.69: Inferred
- Below 0.5: Don't include
