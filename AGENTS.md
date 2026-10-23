# Steward implementation rules

Preserve tagged releases, persistent databases, installation identities and operator configuration. Append database migrations; never rewrite applied migrations. Never commit secrets or generated private deployments under `.steward`.

SSMA declarations are optional signed package metadata. Legacy modules remain supported. Discover only verified installed providers. Authorization, provider selection and workflow approval are deterministic Worker-local decisions. Do not use a model to grant authority or execute arbitrary code.

Keep operational authority in dedicated module databases. Bind obligations to their original provider installation and package identity. Substitution applies to new work only after explicit approval; never transfer reservations implicitly. Uncertain external production submissions require reconciliation, not blind retries.

Run builds, backend tests, browser checks and actual deployment acceptance before release tagging. Simulator results do not establish live Shopify or Printify compatibility. Record failed and unverified gates honestly. No v0.8.0 release tag until all mandatory acceptance gates pass.
