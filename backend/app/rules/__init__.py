"""NL-driven rule authoring.

Auditor describes a rule in Chinese, the LLM compiles it into a structured
form, we run it against existing papers to preview hits/misses, the auditor
flags false positives, the LLM refines, finally we save as an AuditRule.
"""
