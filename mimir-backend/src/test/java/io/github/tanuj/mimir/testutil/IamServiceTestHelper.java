package io.github.tanuj.mimir.testutil;

import io.github.tanuj.mimir.core.common.RegionResolver;
import io.github.tanuj.mimir.core.storage.InMemoryStorage;
import io.github.tanuj.mimir.core.storage.StorageBackend;
import io.github.tanuj.mimir.services.iam.IamService;
import io.github.tanuj.mimir.services.iam.model.AccessKey;

import java.lang.reflect.Constructor;

public final class IamServiceTestHelper {

    private IamServiceTestHelper() {
    }

    @SuppressWarnings("unchecked")
    public static IamService iamServiceWithAccessKey(String accessKeyId, String secretAccessKey) {
        try {
            Constructor<IamService> constructor = IamService.class.getDeclaredConstructor(
                    StorageBackend.class,
                    StorageBackend.class,
                    StorageBackend.class,
                    StorageBackend.class,
                    StorageBackend.class,
                    StorageBackend.class,
                    StorageBackend.class,
                    RegionResolver.class
            );
            constructor.setAccessible(true);

            InMemoryStorage<String, AccessKey> accessKeys = new InMemoryStorage<>();
            accessKeys.put(accessKeyId, new AccessKey(accessKeyId, secretAccessKey, "test-user"));

            return constructor.newInstance(
                    null,
                    null,
                    null,
                    null,
                    accessKeys,
                    null,
                    null,
                    new RegionResolver("us-east-1", "123456789012")
            );
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Failed to construct IamService test fixture", e);
        }
    }
}
