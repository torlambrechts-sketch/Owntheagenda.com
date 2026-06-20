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
      program: {
        Row: {
          id: string
          workspace_id: string
          team_id: string | null
          title: string
          status: string
          current_ord: number
          kind: string
          min_responses: number
          play_key: string | null
          auto_workshop_template: string | null
          assessment_kind: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      program_step: {
        Row: {
          id: string
          program_id: string
          workspace_id: string
          ord: number
          kind: string
          title: string
          status: string
          ref_table: string | null
          ref_id: string | null
          gate: string | null
          config: Json
          scheduled_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
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
        Relationships: [
          {
            foreignKeyName: "membership_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          is_staff: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_staff?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_staff?: boolean
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
      health_status: {
        Row: {
          id: string
          team_id: string
          workspace_id: string
          axis: string
          status: string
          note: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      canvas_snapshot: {
        Row: {
          id: string
          session_id: string | null
          workshop_id: string
          workspace_id: string
          block_ord: number
          title: string | null
          data: Json
          object_count: number
          created_by: string | null
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      plan_task: {
        Row: {
          id: string
          session_id: string
          workspace_id: string
          block_ord: number
          parent_id: string | null
          title: string
          owner_name: string | null
          owner_id: string | null
          start_date: string | null
          end_date: string | null
          status: string
          ord: number
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      follow_up: {
        Row: {
          id: string
          workspace_id: string
          team_id: string | null
          source_session_id: string | null
          kind: string
          title: string
          owner_id: string | null
          scheduled_at: string | null
          workshop_id: string | null
          completed_session_id: string | null
          status: string
          note: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      assessment_category: {
        Row: {
          id: string
          instrument: string
          code: string
          name: string
          ord: number
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      assessment_facet: {
        Row: {
          id: string
          category_id: string
          code: string
          name: string
          ord: number
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      assessment_question: {
        Row: {
          id: string
          facet_id: string
          item_key: string
          ord: number
          text: string
          reverse_scored: boolean
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      leadership_response: {
        Row: {
          id: string
          workspace_id: string
          team_id: string
          user_id: string
          scores: Json
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      help_article: {
        Row: {
          id: string
          kind: string
          slug: string
          title: string
          summary: string | null
          body: string
          category: string
          topic_key: string | null
          icon: string | null
          sort: number
          status: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      help_faq: {
        Row: {
          id: string
          question: string
          answer: string
          category: string
          sort: number
          status: string
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      roadmap_item: {
        Row: {
          id: string
          title: string
          description: string
          status: string
          category: string | null
          sort: number
          vote_count: number
          created_by: string | null
          shipped_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      roadmap_vote: {
        Row: {
          roadmap_item_id: string
          user_id: string
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      integration: {
        Row: {
          id: string
          workspace_id: string
          provider: string
          status: string
          config: Json
          connected_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      team: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          kind: string
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
          join_code: string
          logo_url: string | null
          name: string
          plan: Database["public"]["Enums"]["plan_tier"]
          retention_months: number | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_region?: string
          deleted_at?: string | null
          id?: string
          join_code?: string
          logo_url?: string | null
          name: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          retention_months?: number | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_region?: string
          deleted_at?: string | null
          id?: string
          join_code?: string
          logo_url?: string | null
          name?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          retention_months?: number | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      template: {
        Row: {
          id: string
          workspace_id: string | null
          key: string | null
          name: string
          category: Database["public"]["Enums"]["template_category"]
          source: string | null
          default_duration: number
          description: string | null
          definition: Json
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          key?: string | null
          name: string
          category: Database["public"]["Enums"]["template_category"]
          source?: string | null
          default_duration?: number
          description?: string | null
          definition?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          key?: string | null
          name?: string
          category?: Database["public"]["Enums"]["template_category"]
          source?: string | null
          default_duration?: number
          description?: string | null
          definition?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workshop: {
        Row: {
          id: string
          workspace_id: string
          team_id: string
          title: string
          template_id: string | null
          pulse_id: string | null
          status: Database["public"]["Enums"]["workshop_status"]
          scheduled_at: string | null
          objective: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string
          team_id: string
          title: string
          template_id?: string | null
          pulse_id?: string | null
          status?: Database["public"]["Enums"]["workshop_status"]
          scheduled_at?: string | null
          objective?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          team_id?: string
          title?: string
          template_id?: string | null
          pulse_id?: string | null
          status?: Database["public"]["Enums"]["workshop_status"]
          scheduled_at?: string | null
          objective?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      block: {
        Row: {
          id: string
          workshop_id: string
          ord: number
          title: string
          activity_type: Database["public"]["Enums"]["activity_type"]
          duration: number
          prompt: string | null
          linked_dynamic: Database["public"]["Enums"]["team_dynamic"] | null
          config: Json
          survey_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workshop_id: string
          ord: number
          title: string
          activity_type?: Database["public"]["Enums"]["activity_type"]
          duration?: number
          prompt?: string | null
          linked_dynamic?: Database["public"]["Enums"]["team_dynamic"] | null
          config?: Json
          survey_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workshop_id?: string
          ord?: number
          title?: string
          activity_type?: Database["public"]["Enums"]["activity_type"]
          duration?: number
          prompt?: string | null
          linked_dynamic?: Database["public"]["Enums"]["team_dynamic"] | null
          config?: Json
          survey_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      session: {
        Row: {
          id: string
          workspace_id: string
          workshop_id: string
          facilitator_id: string | null
          status: Database["public"]["Enums"]["session_status"]
          current_block_ord: number
          timer_running: boolean
          timer_ends_at: string | null
          timer_remaining: number
          started_at: string
          ended_at: string | null
          share_token: string | null
          shared_at: string | null
          is_prep: boolean
          prework_all: boolean
          pre_pulse_id: string | null
          post_pulse_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      participant: {
        Row: {
          id: string
          session_id: string
          user_id: string
          is_facilitator: boolean
          ready: boolean
          joined_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      action_item: {
        Row: {
          id: string
          workspace_id: string
          workshop_id: string | null
          team_id: string | null
          session_id: string | null
          decision_id: string | null
          text: string
          owner_name: string | null
          owner_id: string | null
          status: Database["public"]["Enums"]["action_status"]
          due_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      agreement: {
        Row: {
          id: string
          session_id: string
          block_ord: number
          user_id: string | null
          value: number
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      canvas_object: {
        Row: {
          id: string
          session_id: string
          workspace_id: string
          block_ord: number
          kind: string
          text: string
          color: string
          x: number
          y: number
          w: number | null
          h: number | null
          points: Json | null
          src_id: string | null
          dst_id: string | null
          src_anchor: string | null
          dst_anchor: string | null
          line_style: string | null
          stroke: string | null
          fill: string | null
          stroke_w: number | null
          variant: string | null
          author_id: string | null
          author_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      idea: {
        Row: {
          id: string
          session_id: string
          workspace_id: string
          block_ord: number
          lane: string | null
          text: string
          detail: string | null
          impact: number | null
          effort: number | null
          author_id: string | null
          author_name: string | null
          is_anonymous: boolean
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      session_reveal: {
        Row: {
          session_id: string
          block_ord: number
          revealed_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      session_summary: {
        Row: {
          session_id: string
          workspace_id: string
          content: Json
          ai: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      idea_vote: {
        Row: {
          id: string
          idea_id: string
          session_id: string
          block_ord: number
          voter_id: string
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      idea_reaction: {
        Row: {
          id: string
          idea_id: string
          session_id: string
          block_ord: number
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      idea_comment: {
        Row: {
          id: string
          idea_id: string
          session_id: string
          block_ord: number
          user_id: string | null
          author_name: string | null
          body: string
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      notification: {
        Row: {
          id: string
          workspace_id: string
          user_id: string
          kind: string
          title: string
          body: string | null
          link: string | null
          entity_type: string | null
          entity_id: string | null
          read_at: string | null
          emailed_at: string | null
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      decision: {
        Row: {
          id: string
          session_id: string
          workspace_id: string
          title: string
          rationale: string | null
          decision_type: string
          decider_user_id: string | null
          driver_user_id: string | null
          resource_note: string | null
          override_note: string | null
          status: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      decision_contributor: {
        Row: {
          id: string
          decision_id: string
          user_id: string
          daci_role: string
          agreement: number | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      team_charter: {
        Row: {
          team_id: string
          workspace_id: string
          purpose: string | null
          goals: Json
          roles: Json
          work_methods: Json
          norms: Json
          status: string
          source_session_id: string | null
          compiled_by: string | null
          compiled_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      user_manual: {
        Row: {
          user_id: string
          workspace_id: string
          strengths: string | null
          working_style: string | null
          communication_pref: string | null
          feedback_pref: string | null
          watch_outs: string | null
          energizers: string | null
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      survey: {
        Row: {
          id: string
          workspace_id: string
          team_id: string
          kind: string
          name: string
          status: string
          opened_at: string | null
          closed_at: string | null
          due_at: string | null
          subject_user_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      survey_response: {
        Row: {
          id: string
          survey_id: string
          respondent_id: string
          scores: Json
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      assessment_template: {
        Row: {
          id: string
          workspace_id: string | null
          key: string
          name: string
          category: string
          scope: string
          source: string | null
          description: string | null
          definition: Json
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      assessment_trait_copy: {
        Row: {
          id: string
          template_key: string
          dimension_key: string
          definition: string
          advantages: string[]
          risks: string[]
          statements: string[]
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      individual_response: {
        Row: {
          id: string
          workspace_id: string
          user_id: string
          template_key: string
          scores: Json
          shared: boolean
          created_at: string
          updated_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      individual_response_history: {
        Row: {
          id: string
          workspace_id: string
          user_id: string
          template_key: string
          scores: Json
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
      assessment_assignment: {
        Row: {
          id: string
          workspace_id: string
          template_key: string
          assignee_user_id: string
          assigned_by: string
          note: string | null
          due_at: string | null
          created_at: string
        }
        Insert: { [k: string]: unknown }
        Update: { [k: string]: unknown }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_program: {
        Args: { p_workspace: string; p_title: string; p_team?: string | null }
        Returns: string
      }
      set_program_step: {
        Args: {
          p_step: string
          p_status: string
          p_ref_table?: string | null
          p_ref_id?: string | null
          p_scheduled_at?: string | null
        }
        Returns: undefined
      }
      program_status: {
        Args: { p_program: string }
        Returns: { step_id: string; live: string | null; ready: boolean; done: number | null; target: number | null }[]
      }
      program_sync: {
        Args: { p_program: string }
        Returns: undefined
      }
      create_flow: {
        Args: { p_workspace: string; p_title: string; p_team?: string | null; p_min_responses?: number }
        Returns: string
      }
      create_flow_steps: {
        Args: { p_workspace: string; p_title: string; p_team: string | null; p_min_responses: number; p_steps: Json; p_assessment_kind?: string | null }
        Returns: string
      }
      program_start_assessment: {
        Args: { p_program: string }
        Returns: string
      }
      flow_remind: {
        Args: { p_program: string }
        Returns: number
      }
      start_play: {
        Args: {
          p_workspace: string
          p_team: string
          p_play_key: string
          p_title: string
          p_workshop_template_key: string
          p_min_responses?: number
          p_assessment_kind?: string | null
        }
        Returns: string
      }
      program_add_step: {
        Args: { p_program: string; p_after_ord: number; p_kind: string; p_title: string }
        Returns: string
      }
      program_remove_step: {
        Args: { p_step: string }
        Returns: undefined
      }
      program_move_step: {
        Args: { p_step: string; p_dir: number }
        Returns: undefined
      }
      program_set_branch: {
        Args: {
          p_step: string
          p_dynamic: string
          p_op: string
          p_value: number
          p_then_template: string
          p_else_template: string
        }
        Returns: undefined
      }
      program_start_pulse: {
        Args: { p_program: string; p_name?: string | null }
        Returns: string
      }
      program_build_workshop: {
        Args: { p_program: string; p_template: string; p_title?: string | null }
        Returns: string
      }
      program_schedule_repulse: {
        Args: { p_program: string; p_when: string }
        Returns: string
      }
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
      join_workspace_by_code: {
        Args: { p_code: string; p_role?: Database["public"]["Enums"]["workspace_role"] }
        Returns: Json
      }
      my_pending_membership: {
        Args: Record<string, never>
        Returns: Json
      }
      regenerate_join_code: {
        Args: { p_workspace: string }
        Returns: string
      }
      export_member_data: {
        Args: { p_user: string; p_workspace: string }
        Returns: Json
      }
      erase_member: {
        Args: { p_user: string; p_workspace: string }
        Returns: Json
      }
      score_leadership: {
        Args: { p_scores: Json }
        Returns: Json
      }
      leadership_inventory: {
        Args: Record<string, never>
        Returns: Json
      }
      team_leadership_scores: {
        Args: { p_team: string }
        Returns: Json
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
      team_dynamics_history: {
        Args: { p_limit?: number; p_team: string }
        Returns: {
          pulse_id: string
          pulse_name: string
          closed_at: string
          dynamic: Database["public"]["Enums"]["team_dynamic"]
          label: string
          pct: number
          target_low: number
          target_high: number
        }[]
      }
      pulse_participation: {
        Args: { p_pulse: string }
        Returns: {
          user_id: string
          answered: number
          completed: boolean
        }[]
      }
      survey_participation: {
        Args: { p_survey: string }
        Returns: {
          user_id: string
          completed: boolean
        }[]
      }
      set_block_survey: {
        Args: { p_block: string; p_survey: string | null }
        Returns: undefined
      }
      set_survey_subject: {
        Args: { p_survey: string; p_subject: string | null }
        Returns: undefined
      }
      set_team_kind: {
        Args: { p_team: string; p_kind: string }
        Returns: undefined
      }
      set_health_status: {
        Args: { p_team: string; p_axis: string; p_status: string | null; p_note?: string | null }
        Returns: undefined
      }
      workspace_health: {
        Args: { p_workspace: string }
        Returns: Json
      }
      team_health_detail: {
        Args: { p_team: string }
        Returns: Json
      }
      save_canvas_snapshot: {
        Args: { p_session: string; p_block_ord: number; p_title?: string | null }
        Returns: string
      }
      seed_canvas_from_snapshot: {
        Args: { p_snapshot: string; p_session: string; p_block_ord: number }
        Returns: number
      }
      quick_start_workshop: {
        Args: { p_team: string; p_title: string; p_kind: string; p_instrument?: string | null }
        Returns: string
      }
      add_block_live: {
        Args: { p_workshop: string; p_kind: string; p_title?: string | null; p_config?: Json }
        Returns: number
      }
      schedule_follow_up: {
        Args: { p_session: string; p_kind: string; p_title: string; p_when: string; p_owner?: string | null; p_template?: string | null }
        Returns: string
      }
      skip_follow_up: {
        Args: { p_id: string }
        Returns: undefined
      }
      complete_follow_up: {
        Args: { p_id: string }
        Returns: undefined
      }
      reschedule_follow_up: {
        Args: { p_id: string; p_when: string; p_title?: string | null }
        Returns: undefined
      }
      seed_plan_from_session: {
        Args: { p_source: string; p_target: string; p_block: number }
        Returns: number
      }
      survey_perception_gap: {
        Args: { p_survey: string }
        Returns: Json
      }
      remind_pulse: {
        Args: { p_pulse: string }
        Returns: number
      }
      create_workshop_from_template: {
        Args: {
          p_pulse?: string
          p_team: string
          p_template: string
          p_title: string
        }
        Returns: Database["public"]["Tables"]["workshop"]["Row"]
      }
      start_session: {
        Args: { p_workshop: string }
        Returns: Database["public"]["Tables"]["session"]["Row"]
      }
      open_prework: {
        Args: { p_workshop: string; p_all?: boolean }
        Returns: Database["public"]["Tables"]["session"]["Row"]
      }
      join_session: { Args: { p_session: string }; Returns: undefined }
      set_ready: {
        Args: { p_ready: boolean; p_session: string }
        Returns: undefined
      }
      session_phase: {
        Args: { p_ord: number; p_session: string }
        Returns: Database["public"]["Tables"]["session"]["Row"]
      }
      session_timer: {
        Args: { p_action: string; p_session: string }
        Returns: Database["public"]["Tables"]["session"]["Row"]
      }
      end_session: { Args: { p_session: string }; Returns: undefined }
      add_action: {
        Args: { p_owner?: string; p_session: string; p_text: string; p_owner_id?: string; p_due?: string }
        Returns: Database["public"]["Tables"]["action_item"]["Row"]
      }
      toggle_action: { Args: { p_action: string }; Returns: undefined }
      idea_vote_toggle: { Args: { p_idea: string }; Returns: undefined }
      idea_react_toggle: { Args: { p_idea: string; p_emoji: string }; Returns: undefined }
      idea_comment_add: {
        Args: { p_idea: string; p_body: string }
        Returns: Database["public"]["Tables"]["idea_comment"]["Row"]
      }
      idea_seed: {
        Args: { p_session: string; p_block_ord: number; p_texts: string[] }
        Returns: undefined
      }
      schedule_workshop: {
        Args: { p_workshop: string; p_at: string }
        Returns: Database["public"]["Tables"]["workshop"]["Row"]
      }
      mark_notifications_read: { Args: { p_id?: string }; Returns: undefined }
      create_decision: {
        Args: { p_session: string; p_title: string; p_rationale?: string }
        Returns: Database["public"]["Tables"]["decision"]["Row"]
      }
      update_decision: {
        Args: {
          p_decision: string
          p_title?: string
          p_rationale?: string
          p_type?: string
          p_decider?: string
          p_driver?: string
          p_resource_note?: string
        }
        Returns: Database["public"]["Tables"]["decision"]["Row"]
      }
      record_agreement: { Args: { p_decision: string; p_level: number }; Returns: undefined }
      set_daci: { Args: { p_decision: string; p_user: string; p_role: string }; Returns: undefined }
      commit_decision: {
        Args: { p_decision: string; p_override_note?: string }
        Returns: Database["public"]["Tables"]["decision"]["Row"]
      }
      supersede_decision: { Args: { p_decision: string }; Returns: undefined }
      add_decision_action: {
        Args: { p_decision: string; p_text: string; p_owner: string; p_due: string | null }
        Returns: Database["public"]["Tables"]["action_item"]["Row"]
      }
      reveal_block: { Args: { p_session: string; p_block_ord: number }; Returns: undefined }
      save_summary: { Args: { p_session: string; p_content: Json; p_ai: boolean }; Returns: undefined }
      approve_summary: { Args: { p_session: string }; Returns: undefined }
      upsert_user_manual: {
        Args: {
          p_workspace: string
          p_strengths?: string
          p_working_style?: string
          p_communication_pref?: string
          p_feedback_pref?: string
          p_watch_outs?: string
          p_energizers?: string
        }
        Returns: Database["public"]["Tables"]["user_manual"]["Row"]
      }
      save_charter_section: {
        Args: { p_team: string; p_section: string; p_value: Json }
        Returns: Database["public"]["Tables"]["team_charter"]["Row"]
      }
      compile_charter: {
        Args: { p_team: string; p_session?: string }
        Returns: Database["public"]["Tables"]["team_charter"]["Row"]
      }
      ensure_workshop_pulse: {
        Args: { p_workshop: string; p_timing?: string }
        Returns: string
      }
      create_survey: {
        Args: { p_team: string; p_kind: string; p_name: string; p_due?: string }
        Returns: Database["public"]["Tables"]["survey"]["Row"]
      }
      remind_survey: {
        Args: { p_survey: string }
        Returns: number
      }
      submit_survey_response: {
        Args: { p_survey: string; p_scores: Json }
        Returns: undefined
      }
      submit_individual_response: {
        Args: { p_workspace: string; p_template_key: string; p_scores: Json }
        Returns: undefined
      }
      individual_norms: {
        Args: { p_template_key: string }
        Returns: Json
      }
      assign_assessment: {
        Args: { p_workspace: string; p_template_key: string; p_assignees: string[]; p_note?: string | null; p_due?: string | null }
        Returns: number
      }
      unassign_assessment: {
        Args: { p_workspace: string; p_template_key: string; p_assignee: string }
        Returns: undefined
      }
      assessment_assignment_status: {
        Args: { p_workspace: string; p_template_key: string }
        Returns: { assignee_user_id: string; due_at: string | null; completed: boolean }[]
      }
      set_individual_shared: {
        Args: { p_workspace: string; p_template_key: string; p_shared: boolean }
        Returns: undefined
      }
      save_assessment_template: {
        Args: {
          p_workspace: string
          p_id: string | null
          p_name: string
          p_category: string
          p_scope: string
          p_description: string | null
          p_source: string | null
          p_definition: Json
        }
        Returns: Database["public"]["Tables"]["assessment_template"]["Row"]
      }
      delete_assessment_template: {
        Args: { p_id: string }
        Returns: undefined
      }
      survey_results: {
        Args: { p_survey: string; p_strength_items?: string[] }
        Returns: Json
      }
      close_survey: {
        Args: { p_survey: string }
        Returns: Database["public"]["Tables"]["survey"]["Row"]
      }
      ensure_block_survey: {
        Args: { p_block: string }
        Returns: string
      }
      submit_agreement: {
        Args: { p_block_ord: number; p_session: string; p_value: number }
        Returns: undefined
      }
      agreement_summary: {
        Args: { p_block_ord: number; p_session: string }
        Returns: { value: number; count: number }[]
      }
      session_share_set: {
        Args: { p_session: string; p_on: boolean }
        Returns: string | null
      }
      public_session_readout: {
        Args: { p_token: string }
        Returns: Json
      }
      session_pulse_open: {
        Args: { p_session: string; p_phase: string }
        Returns: string
      }
      session_pulse_delta: {
        Args: { p_session: string }
        Returns: {
          dynamic: string
          label: string
          question: string
          pre_pct: number | null
          pre_n: number
          post_pct: number | null
          post_n: number
          delta: number | null
        }[]
      }
    }
    Enums: {
      action_status: "open" | "done"
      activity_type: "canvas" | "vote" | "discuss" | "checkin" | "outcome" | "brainstorm" | "feedback" | "manual" | "charter" | "assess" | "survey"
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      membership_status: "active" | "suspended" | "pending"
      plan_tier: "free" | "pro" | "enterprise"
      pulse_status: "draft" | "open" | "closed"
      template_category:
        | "team"
        | "retro"
        | "ideation"
        | "prioritization"
        | "strategy"
        | "design"
        | "kickoff"
        | "checkin"
      workshop_status: "draft" | "scheduled" | "live" | "done"
      session_status: "live" | "ended"
      team_dynamic:
        | "psych_safety"
        | "trust"
        | "conflict_norms"
        | "role_clarity"
        | "decision_rights"
      workspace_role: "owner" | "admin" | "manager" | "facilitator" | "member"
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
      action_status: ["open", "done"],
      activity_type: ["canvas", "vote", "discuss", "checkin", "outcome", "brainstorm", "feedback", "manual", "charter", "assess", "survey"],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      membership_status: ["active", "suspended", "pending"],
      plan_tier: ["free", "pro", "enterprise"],
      pulse_status: ["draft", "open", "closed"],
      template_category: [
        "team",
        "retro",
        "ideation",
        "prioritization",
        "strategy",
        "design",
        "kickoff",
        "checkin",
      ],
      workshop_status: ["draft", "scheduled", "live", "done"],
      session_status: ["live", "ended"],
      team_dynamic: [
        "psych_safety",
        "trust",
        "conflict_norms",
        "role_clarity",
        "decision_rights",
      ],
      workspace_role: ["owner", "admin", "manager", "facilitator", "member"],
    },
  },
} as const
