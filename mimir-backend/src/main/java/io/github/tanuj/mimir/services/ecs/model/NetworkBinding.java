package io.github.tanuj.mimir.services.ecs.model;

public record NetworkBinding(String bindIP, int containerPort, int hostPort, String protocol) {
}
