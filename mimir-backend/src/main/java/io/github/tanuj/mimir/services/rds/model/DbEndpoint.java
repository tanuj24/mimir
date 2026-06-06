package io.github.tanuj.mimir.services.rds.model;

import io.quarkus.runtime.annotations.RegisterForReflection;

@RegisterForReflection
public record DbEndpoint(String address, int port) {}
