package io.github.tanuj.mimir.services.ecs.model;

public record PortMapping(int containerPort, int hostPort, String protocol) {

    public PortMapping(int containerPort) {
        this(containerPort, 0, "tcp");
    }
}
