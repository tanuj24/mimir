package io.github.tanuj.mimir.services.ses.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.quarkus.runtime.annotations.RegisterForReflection;

@RegisterForReflection
public record Tag(
        @JsonProperty("Key") String key,
        @JsonProperty("Value") String value) {
}
