import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Home } from "@/pages/Home";
import { ComingSoon } from "@/pages/ComingSoon";
import { NotFound } from "@/pages/NotFound";
import { BucketsPage } from "@/pages/s3/BucketsPage";
import { BucketDetailPage } from "@/pages/s3/BucketDetailPage";
import { TablesPage } from "@/pages/dynamodb/TablesPage";
import { TableDetailPage } from "@/pages/dynamodb/TableDetailPage";
import { LambdaPage } from "@/pages/lambda/LambdaPage";
import { SqsPage } from "@/pages/sqs/SqsPage";
import { SnsPage } from "@/pages/sns/SnsPage";
import { LogsPage } from "@/pages/logs/LogsPage";
import { MetricsPage } from "@/pages/metrics/MetricsPage";
import { KmsPage } from "@/pages/kms/KmsPage";
import { SecretsPage } from "@/pages/secrets/SecretsPage";
import { SsmPage } from "@/pages/ssm/SsmPage";
import { Ec2Page } from "@/pages/ec2/Ec2Page";
import { EcsPage } from "@/pages/ecs/EcsPage";
import { EcrPage } from "@/pages/ecr/EcrPage";
import { EksPage } from "@/pages/eks/EksPage";
import { GluePage } from "@/pages/glue/GluePage";
import { KafkaPage } from "@/pages/kafka/KafkaPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: "s3", element: <BucketsPage /> },
      { path: "s3/:bucket", element: <BucketDetailPage /> },
      { path: "dynamodb", element: <TablesPage /> },
      { path: "dynamodb/:name", element: <TableDetailPage /> },
      { path: "lambda", element: <LambdaPage /> },
      { path: "sqs", element: <SqsPage /> },
      { path: "sns", element: <SnsPage /> },
      { path: "logs", element: <LogsPage /> },
      { path: "metrics", element: <MetricsPage /> },
      { path: "kms", element: <KmsPage /> },
      { path: "secrets", element: <SecretsPage /> },
      { path: "ssm", element: <SsmPage /> },
      { path: "ec2", element: <Ec2Page /> },
      { path: "ecs", element: <EcsPage /> },
      { path: "ecr", element: <EcrPage /> },
      { path: "eks", element: <EksPage /> },
      { path: "glue", element: <GluePage /> },
      { path: "kafka", element: <KafkaPage /> },
      { path: "coming-soon/:id", element: <ComingSoon /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
