// =====================================================================
// OwnTheAgenda — generated database types
// Source of truth is the SQL in supabase/migrations. Regenerate with:
//   supabase gen types typescript --project-id fqeohcfkimoopwjxxcft > types/database.types.ts
// (or via the Supabase MCP `generate_typescript_types`). Do not edit by hand.
// =====================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          metadata: Json
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          metadata?: Json
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          metadata?: Json
          workspace_id?: string | null
        }
        Relationships: []
      }
      dynamic_band: {
        Row: {
          dynamic: Database["public"]["Enums"]["team_dynamic"]
          label: string
          ord: number
          question: string
          target_high: number
          target_low: number
        }
        Insert: {
          dynamic: Database["public"]["Enums"]["team_dynamic"]
          label: string
          ord?: number
          question: string
          target_high: number
          target_low: number
        }
        Update: {
          dynamic?: Database["public"]["Enums"]["team_dynamic"]
          label?: string
          ord?: number
          question?: string
          target_high?: number
          target_low?: number
        }
        Relationships: []
      }
      fingerprint: {
        Row: {
          band_high: number
          band_low: number
          created_at: string
          id: string
          team_member_id: string
          trait: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          band_high: number
          band_low: number
          created_at?: string
          id?: string
          team_member_id: string
          trait: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          band_high?: number
          band_low?: number
          created_at?: string
          id?: string
          team_member_id?: string
          trait?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      invitation: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          role_title: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          team_id: string | null
          token_hash: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          role_title?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          team_id?: string | null
          token_hash: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          role_title?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          team_id?: string | null
          token_hash?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      membership: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      profile: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pulse: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          opened_at: string | null
          status: Database["public"]["Enums"]["pulse_status"]
          team_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          opened_at?: string | null
          status?: Database["public"]["Enums"]["pulse_status"]
          team_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          opened_at?: string | null
          status?: Database["public"]["Enums"]["pulse_status"]
          team_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      pulse_response: {
        Row: {
          created_at: string
          dynamic: Database["public"]["Enums"]["team_dynamic"]
          id: string
          pulse_id: string
          respondent_id: string | null
          score: number
        }
        Insert: {
          created_at?: string
          dynamic: Database["public"]["Enums"]["team_dynamic"]
          id?: string
          pulse_id: string
          respondent_id?: string | null
          score: number
        }
        Update: {
          created_at?: string
          dynamic?: Database["public"]["Enums"]["team_dynamic"]
          id?: string
          pulse_id?: string
          respondent_id?: string | null
          score?: number
        }
        Relationships: []
      }
      team: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          lead_user_id: string | null
          name: string
          parent_team_id: string | null
          slug: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          lead_user_id?: string | null
          name: string
          parent_team_id?: string | null
          slug?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          lead_user_id?: string | null
          name?: string
          parent_team_id?: string | null
          slug?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      team_member: {
        Row: {
          consent_share: boolean
          created_at: string
          id: string
          is_lead: boolean
          role_title: string | null
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          consent_share?: boolean
          created_at?: string
          id?: string
          is_lead?: boolean
          role_title?: string | null
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          consent_share?: boolean
          created_at?: string
          id?: string
          is_lead?: boolean
          role_title?: string | null
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workspace: {
        Row: {
          created_at: string
          created_by: string | null
          data_region: string
          deleted_at: string | null
          id: string
          logo_url: string | null
          name: string
          plan: Database["public"]["Enums"]["plan_tier"]
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_region?: string
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_region?: string
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { p_token: string }
        Returns: Database["public"]["Tables"]["workspace"]["Row"]
      }
      close_pulse: {
        Args: { p_pulse: string }
        Returns: Database["public"]["Tables"]["pulse"]["Row"]
      }
      create_invitation: {
        Args: {
          p_email: string
          p_role?: Database["public"]["Enums"]["workspace_role"]
          p_role_title?: string
          p_team?: string
          p_workspace: string
        }
        Returns: string
      }
      create_pulse: {
        Args: { p_name: string; p_team: string }
        Returns: Database["public"]["Tables"]["pulse"]["Row"]
      }
      provision_workspace: {
        Args: { p_name: string; p_slug?: string }
        Returns: Database["public"]["Tables"]["workspace"]["Row"]
      }
      set_team_consent: {
        Args: { p_consent: boolean; p_team_member: string }
        Returns: Database["public"]["Tables"]["team_member"]["Row"]
      }
      submit_pulse_response: {
        Args: { p_pulse: string; p_scores: Json }
        Returns: undefined
      }
      team_dynamics: {
        Args: { p_pulse?: string; p_team: string }
        Returns: {
          dynamic: Database["public"]["Enums"]["team_dynamic"]
          in_band: boolean
          label: string
          pct: number
          question: string
          responses: number
          target_high: number
          target_low: number
        }[]
      }
    }
    Enums: {
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      membership_status: "active" | "suspended"
      plan_tier: "free" | "pro" | "enterprise"
      pulse_status: "draft" | "open" | "closed"
      team_dynamic:
        | "psych_safety"
        | "trust"
        | "conflict_norms"
        | "role_clarity"
        | "decision_rights"
      workspace_role: "owner" | "admin" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database["public"]

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"]
export type Enums<T extends keyof DefaultSchema["Enums"]> =
  DefaultSchema["Enums"][T]

export const Constants = {
  public: {
    Enums: {
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      membership_status: ["active", "suspended"],
      plan_tier: ["free", "pro", "enterprise"],
      pulse_status: ["draft", "open", "closed"],
      team_dynamic: [
        "psych_safety",
        "trust",
        "conflict_norms",
        "role_clarity",
        "decision_rights",
      ],
      workspace_role: ["owner", "admin", "member"],
    },
  },
} as const
