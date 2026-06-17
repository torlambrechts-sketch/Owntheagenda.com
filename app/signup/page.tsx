import { AuthForm } from "@/components/AuthForm";

export default function SignupPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return <AuthForm mode="signup" next={searchParams.next} />;
}
