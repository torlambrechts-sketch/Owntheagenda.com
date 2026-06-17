import { AuthForm } from "@/components/AuthForm";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return <AuthForm mode="login" next={searchParams.next} />;
}
