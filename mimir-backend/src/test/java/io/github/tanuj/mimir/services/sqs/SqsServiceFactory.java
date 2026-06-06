package io.github.tanuj.mimir.services.sqs;

import io.github.tanuj.mimir.core.common.RegionResolver;
import io.github.tanuj.mimir.core.storage.InMemoryStorage;
import io.github.tanuj.mimir.services.sns.SnsService;

/**
 * Test helper to create SqsService instances
 */
public class SqsServiceFactory {

    public static SqsService createInMemory(String baseUrl, RegionResolver regionResolver) {
        return new SqsService(new InMemoryStorage<>(), new InMemoryStorage<>(), new InMemoryStorage<>(),
                30, 262144, baseUrl, regionResolver);
    }

    public static SqsService createInMemoryWithFifoDedupPurgeAndSns(String baseUrl, RegionResolver regionResolver,
                                                                    SnsService snsService) {
        return new SqsService(new InMemoryStorage<>(), new InMemoryStorage<>(), new InMemoryStorage<>(),
                30, 262144, baseUrl, regionResolver, true, snsService);
    }
}
