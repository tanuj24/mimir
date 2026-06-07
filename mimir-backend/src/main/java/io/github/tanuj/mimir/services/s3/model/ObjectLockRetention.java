package io.github.tanuj.mimir.services.s3.model;

public record ObjectLockRetention(String mode, String unit, int value) {}
