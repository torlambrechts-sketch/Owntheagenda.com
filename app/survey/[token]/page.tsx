import { createClient } from "@/lib/supabase/server";
import { LogoMark } from "@/components/Logo";
import { instrumentFromRow } from "@/lib/survey";
import { PublicSurveyForm } from "./PublicSurveyForm";

type Meta = { name: string; kind: string; open: boolean; definition: unknown };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("public_survey_meta", { p_token: params.token });
  const meta = data as Meta | null;
  return { title: meta ? `${meta.name} · Respond` : "Survey", robots: { index: false } };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="sharepage">
      <div className="sharewrap">
        <div className="share-brand" style={{ marginBottom: 18 }}>
          <LogoMark size={30} /><span className="wm">Own<span className="t">the</span>Agenda</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default async function PublicSurveyPage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("public_survey_meta", { p_token: params.token });
  const meta = data as Meta | null;

  if (!meta) {
    return (
      <Shell>
        <div className="narrow-card" style={{ textAlign: "center", marginTop: 40 }}>
          <h1 style={{ marginTop: 0 }}>Link unavailable</h1>
          <p className="lede" style={{ marginBottom: 0 }}>This survey link has been revoked, or the address is incorrect.</p>
        </div>
      </Shell>
    );
  }

  if (!meta.open) {
    return (
      <Shell>
        <div className="narrow-card" style={{ textAlign: "center", marginTop: 40 }}>
          <h1 style={{ marginTop: 0 }}>{meta.name}</h1>
          <p className="lede" style={{ marginBottom: 0 }}>This survey is now closed. Thanks for your interest.</p>
        </div>
      </Shell>
    );
  }

  const instrument = instrumentFromRow({ key: meta.kind, name: meta.name, definition: meta.definition });
  if (!instrument) {
    return (
      <Shell>
        <div className="narrow-card" style={{ textAlign: "center", marginTop: 40 }}>
          <h1 style={{ marginTop: 0 }}>{meta.name}</h1>
          <p className="lede" style={{ marginBottom: 0 }}>This survey can&apos;t be displayed right now.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="readout-head" style={{ marginTop: 4, marginBottom: 14 }}>
        <div>
          <div className="eyebrow">You&apos;ve been invited to respond</div>
          <h1 className="page-title" style={{ marginTop: 2 }}>{meta.name}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{instrument.name} · ~2 minutes · fully anonymous</p>
        </div>
      </div>
      <PublicSurveyForm token={params.token} instrument={instrument} />
    </Shell>
  );
}
