export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_drafts: {
        Row: {
          id: string
          tenant_id: string
          matter_id: string
          draft_type: string
          title: string | null
          content: string | null
          status: string
          hitl_checks: Json | null
          verified_by: string | null
          verified_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          matter_id: string
          draft_type?: string
          title?: string | null
          content?: string | null
          status?: string
          hitl_checks?: Json | null
          verified_by?: string | null
          verified_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          matter_id?: string
          draft_type?: string
          title?: string | null
          content?: string | null
          status?: string
          hitl_checks?: Json | null
          verified_by?: string | null
          verified_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          activity_type: string
          contact_id: string | null
          created_at: string | null
          description: string | null
          engagement_points: number | null
          entity_id: string | null
          entity_type: string | null
          id: string
          matter_id: string | null
          metadata: Json | null
          tenant_id: string
          title: string
          user_id: string | null
        }
        Insert: {
          activity_type: string
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          engagement_points?: number | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          matter_id?: string | null
          metadata?: Json | null
          tenant_id: string
          title: string
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          engagement_points?: number | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          matter_id?: string | null
          metadata?: Json | null
          tenant_id?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_interactions: {
        Row: {
          cost_cents: number | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          input_metadata: Json | null
          input_text: string | null
          interaction_type: string
          model_used: string | null
          output_structured: Json | null
          output_text: string | null
          tenant_id: string
          tokens_input: number | null
          tokens_output: number | null
          user_feedback: string | null
          user_id: string | null
          user_rating: number | null
        }
        Insert: {
          cost_cents?: number | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          input_metadata?: Json | null
          input_text?: string | null
          interaction_type: string
          model_used?: string | null
          output_structured?: Json | null
          output_text?: string | null
          tenant_id: string
          tokens_input?: number | null
          tokens_output?: number | null
          user_feedback?: string | null
          user_id?: string | null
          user_rating?: number | null
        }
        Update: {
          cost_cents?: number | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          input_metadata?: Json | null
          input_text?: string | null
          interaction_type?: string
          model_used?: string | null
          output_structured?: Json | null
          output_text?: string | null
          tenant_id?: string
          tokens_input?: number | null
          tokens_output?: number | null
          user_feedback?: string | null
          user_id?: string | null
          user_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_interactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          prompt_type: string
          system_prompt: string
          tenant_id: string
          updated_at: string | null
          user_prompt_template: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          prompt_type: string
          system_prompt: string
          tenant_id: string
          updated_at?: string | null
          user_prompt_template: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          prompt_type?: string
          system_prompt?: string
          tenant_id?: string
          updated_at?: string | null
          user_prompt_template?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_prompt_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          scopes: string[] | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          scopes?: string[] | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          scopes?: string[] | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_attendees: {
        Row: {
          appointment_id: string
          contact_id: string | null
          created_at: string | null
          id: string
          response_status: string | null
          user_id: string | null
        }
        Insert: {
          appointment_id: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          response_status?: string | null
          user_id?: string | null
        }
        Update: {
          appointment_id?: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          response_status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_attendees_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          answers: Json | null
          appointment_date: string
          booking_page_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          duration_minutes: number
          end_time: string
          guest_email: string
          guest_name: string
          guest_notes: string | null
          guest_phone: string | null
          id: string
          lead_id: string | null
          start_time: string
          started_at: string | null
          status: string
          tenant_id: string
          user_id: string
          guest_name_encrypted: string | null
          guest_email_encrypted: string | null
          guest_phone_encrypted: string | null
        }
        Insert: {
          answers?: Json | null
          appointment_date: string
          booking_page_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          duration_minutes: number
          end_time: string
          guest_email: string
          guest_name: string
          guest_notes?: string | null
          guest_phone?: string | null
          id?: string
          lead_id?: string | null
          start_time: string
          started_at?: string | null
          status?: string
          tenant_id: string
          user_id: string
          guest_name_encrypted?: string | null
          guest_email_encrypted?: string | null
          guest_phone_encrypted?: string | null
        }
        Update: {
          answers?: Json | null
          appointment_date?: string
          booking_page_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          duration_minutes?: number
          end_time?: string
          guest_email?: string
          guest_name?: string
          guest_notes?: string | null
          guest_phone?: string | null
          id?: string
          lead_id?: string | null
          start_time?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
          user_id?: string
          guest_name_encrypted?: string | null
          guest_email_encrypted?: string | null
          guest_phone_encrypted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_booking_page_id_fkey"
            columns: ["booking_page_id"]
            isOneToOne: false
            referencedRelation: "booking_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json
          severity: string | null
          source: string | null
          tenant_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          severity?: string | null
          source?: string | null
          tenant_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          severity?: string | null
          source?: string | null
          tenant_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_execution_log: {
        Row: {
          actions_executed: Json
          automation_rule_id: string
          executed_at: string
          executed_by: string | null
          id: string
          matter_id: string | null
          tenant_id: string
          trigger_context: Json
          trigger_event: string
        }
        Insert: {
          actions_executed?: Json
          automation_rule_id: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          matter_id?: string | null
          tenant_id: string
          trigger_context?: Json
          trigger_event: string
        }
        Update: {
          actions_executed?: Json
          automation_rule_id?: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          matter_id?: string | null
          tenant_id?: string
          trigger_context?: Json
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_execution_log_automation_rule_id_fkey"
            columns: ["automation_rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_execution_log_executed_by_fkey"
            columns: ["executed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_execution_log_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_execution_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          actions_executed: Json | null
          automation_id: string
          completed_at: string | null
          error_message: string | null
          id: string
          started_at: string | null
          status: string | null
          tenant_id: string
          trigger_entity_id: string | null
          trigger_entity_type: string | null
        }
        Insert: {
          actions_executed?: Json | null
          automation_id: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          tenant_id: string
          trigger_entity_id?: string | null
          trigger_entity_type?: string | null
        }
        Update: {
          actions_executed?: Json | null
          automation_id?: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          tenant_id?: string
          trigger_entity_id?: string | null
          trigger_entity_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "workflow_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_queue: {
        Row: {
          action_index: number | null
          automation_id: string
          created_at: string | null
          entity_id: string
          entity_type: string
          execute_at: string
          id: string
          status: string | null
          tenant_id: string
        }
        Insert: {
          action_index?: number | null
          automation_id: string
          created_at?: string | null
          entity_id: string
          entity_type: string
          execute_at: string
          id?: string
          status?: string | null
          tenant_id: string
        }
        Update: {
          action_index?: number | null
          automation_id?: string
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          execute_at?: string
          id?: string
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_queue_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "workflow_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          case_type_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          matter_type_id: string | null
          name: string
          sort_order: number
          tenant_id: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          case_type_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          matter_type_id?: string | null
          name: string
          sort_order?: number
          tenant_id: string
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          case_type_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          matter_type_id?: string | null
          name?: string
          sort_order?: number
          tenant_id?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "immigration_case_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_feed_transactions: {
        Row: {
          amount_cents: number
          bank_account_id: string
          bank_reference: string | null
          created_at: string
          description: string | null
          excluded_reason: string | null
          external_txn_id: string | null
          feed_source: string
          id: string
          import_batch_id: string | null
          match_status: string
          matched_at: string | null
          matched_by: string | null
          matched_transaction_id: string | null
          payee_name: string | null
          posted_date: string | null
          raw_data: Json | null
          tenant_id: string
          txn_date: string
        }
        Insert: {
          amount_cents: number
          bank_account_id: string
          bank_reference?: string | null
          created_at?: string
          description?: string | null
          excluded_reason?: string | null
          external_txn_id?: string | null
          feed_source: string
          id?: string
          import_batch_id?: string | null
          match_status?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_transaction_id?: string | null
          payee_name?: string | null
          posted_date?: string | null
          raw_data?: Json | null
          tenant_id: string
          txn_date: string
        }
        Update: {
          amount_cents?: number
          bank_account_id?: string
          bank_reference?: string | null
          created_at?: string
          description?: string | null
          excluded_reason?: string | null
          external_txn_id?: string | null
          feed_source?: string
          id?: string
          import_batch_id?: string | null
          match_status?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_transaction_id?: string | null
          payee_name?: string | null
          posted_date?: string | null
          raw_data?: Json | null
          tenant_id?: string
          txn_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_feed_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "trust_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_feed_transactions_matched_by_fkey"
            columns: ["matched_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_feed_transactions_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "trust_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_feed_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_categories: {
        Row: {
          code: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
        }
        Insert: {
          code: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      billing_invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          invoice_pdf: string | null
          invoice_url: string | null
          period_end: string | null
          period_start: string | null
          status: string
          stripe_invoice_id: string | null
          tenant_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_pdf?: string | null
          invoice_url?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_invoice_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_pdf?: string | null
          invoice_url?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_invoice_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_appointments: {
        Row: {
          answers: Json | null
          assigned_to: string | null
          booker_email: string | null
          booker_name: string | null
          booker_phone: string | null
          booking_page_id: string | null
          check_in_session_id: string | null
          checked_in_at: string | null
          contact_id: string | null
          created_at: string
          end_time: string
          id: string
          matter_id: string | null
          metadata: Json | null
          start_time: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          answers?: Json | null
          assigned_to?: string | null
          booker_email?: string | null
          booker_name?: string | null
          booker_phone?: string | null
          booking_page_id?: string | null
          check_in_session_id?: string | null
          checked_in_at?: string | null
          contact_id?: string | null
          created_at?: string
          end_time: string
          id?: string
          matter_id?: string | null
          metadata?: Json | null
          start_time: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          answers?: Json | null
          assigned_to?: string | null
          booker_email?: string | null
          booker_name?: string | null
          booker_phone?: string | null
          booking_page_id?: string | null
          check_in_session_id?: string | null
          checked_in_at?: string | null
          contact_id?: string | null
          created_at?: string
          end_time?: string
          id?: string
          matter_id?: string | null
          metadata?: Json | null
          start_time?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_appointments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_appointments_booking_page_id_fkey"
            columns: ["booking_page_id"]
            isOneToOne: false
            referencedRelation: "booking_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_appointments_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_booking_appts_check_in"
            columns: ["check_in_session_id"]
            isOneToOne: false
            referencedRelation: "check_in_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_links: {
        Row: {
          auto_create_contact: boolean | null
          auto_create_lead: boolean | null
          available_hours: Json | null
          buffer_minutes: number | null
          created_at: string | null
          default_pipeline_id: string | null
          default_practice_area_id: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          intake_fields: Json | null
          is_active: boolean | null
          location_type: string | null
          max_advance_days: number | null
          slug: string
          tenant_id: string
          title: string
          user_id: string
        }
        Insert: {
          auto_create_contact?: boolean | null
          auto_create_lead?: boolean | null
          available_hours?: Json | null
          buffer_minutes?: number | null
          created_at?: string | null
          default_pipeline_id?: string | null
          default_practice_area_id?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          intake_fields?: Json | null
          is_active?: boolean | null
          location_type?: string | null
          max_advance_days?: number | null
          slug: string
          tenant_id: string
          title: string
          user_id: string
        }
        Update: {
          auto_create_contact?: boolean | null
          auto_create_lead?: boolean | null
          available_hours?: Json | null
          buffer_minutes?: number | null
          created_at?: string | null
          default_pipeline_id?: string | null
          default_practice_area_id?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          intake_fields?: Json | null
          is_active?: boolean | null
          location_type?: string | null
          max_advance_days?: number | null
          slug?: string
          tenant_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_links_default_pipeline_id_fkey"
            columns: ["default_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_links_default_practice_area_id_fkey"
            columns: ["default_practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_page_overrides: {
        Row: {
          booking_page_id: string
          created_at: string
          end_time: string | null
          id: string
          is_available: boolean
          override_date: string
          start_time: string | null
          tenant_id: string
        }
        Insert: {
          booking_page_id: string
          created_at?: string
          end_time?: string | null
          id?: string
          is_available?: boolean
          override_date: string
          start_time?: string | null
          tenant_id: string
        }
        Update: {
          booking_page_id?: string
          created_at?: string
          end_time?: string | null
          id?: string
          is_available?: boolean
          override_date?: string
          start_time?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_page_overrides_booking_page_id_fkey"
            columns: ["booking_page_id"]
            isOneToOne: false
            referencedRelation: "booking_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_page_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_pages: {
        Row: {
          buffer_minutes: number
          confirmation_message: string | null
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          max_days_ahead: number
          min_notice_hours: number
          pipeline_id: string | null
          practice_area_id: string | null
          questions: Json
          slug: string
          stage_id: string | null
          status: string
          tenant_id: string
          theme_color: string | null
          timezone: string
          title: string
          updated_at: string
          user_id: string
          working_hours: Json
        }
        Insert: {
          buffer_minutes?: number
          confirmation_message?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          max_days_ahead?: number
          min_notice_hours?: number
          pipeline_id?: string | null
          practice_area_id?: string | null
          questions?: Json
          slug: string
          stage_id?: string | null
          status?: string
          tenant_id: string
          theme_color?: string | null
          timezone?: string
          title: string
          updated_at?: string
          user_id: string
          working_hours?: Json
        }
        Update: {
          buffer_minutes?: number
          confirmation_message?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          max_days_ahead?: number
          min_notice_hours?: number
          pipeline_id?: string | null
          practice_area_id?: string | null
          questions?: Json
          slug?: string
          stage_id?: string | null
          status?: string
          tenant_id?: string
          theme_color?: string | null
          timezone?: string
          title?: string
          updated_at?: string
          user_id?: string
          working_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "booking_pages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_pages_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_pages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_pages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      break_glass_access_grants: {
        Row: {
          expires_at: string
          granted_at: string | null
          granted_by: string
          granted_to: string
          id: string
          matter_id: string | null
          reason: string
          revoked_at: string | null
          revoked_by: string | null
          target_user_id: string
          tenant_id: string
        }
        Insert: {
          expires_at: string
          granted_at?: string | null
          granted_by: string
          granted_to: string
          id?: string
          matter_id?: string | null
          reason: string
          revoked_at?: string | null
          revoked_by?: string | null
          target_user_id: string
          tenant_id: string
        }
        Update: {
          expires_at?: string
          granted_at?: string | null
          granted_by?: string
          granted_to?: string
          id?: string
          matter_id?: string | null
          reason?: string
          revoked_at?: string | null
          revoked_by?: string | null
          target_user_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "break_glass_access_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_glass_access_grants_granted_to_fkey"
            columns: ["granted_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_glass_access_grants_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_glass_access_grants_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_glass_access_grants_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_glass_access_grants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_attendees: {
        Row: {
          contact_id: string | null
          created_at: string
          email: string | null
          event_id: string
          id: string
          response_status: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          email?: string | null
          event_id: string
          id?: string
          response_status?: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          email?: string | null
          event_id?: string
          id?: string
          response_status?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_attendees_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_attendees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          color: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          description: string | null
          end_at: string
          event_type: string
          external_id: string | null
          external_provider: string | null
          external_sync_token: string | null
          id: string
          is_active: boolean
          is_client_visible: boolean | null
          last_synced_at: string | null
          location: string | null
          matter_id: string | null
          recurrence_exception_dates: string[] | null
          recurrence_parent_id: string | null
          recurrence_rule: string | null
          show_as: string | null
          start_at: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          color?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_at: string
          event_type?: string
          external_id?: string | null
          external_provider?: string | null
          external_sync_token?: string | null
          id?: string
          is_active?: boolean
          is_client_visible?: boolean | null
          last_synced_at?: string | null
          location?: string | null
          matter_id?: string | null
          recurrence_exception_dates?: string[] | null
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          show_as?: string | null
          start_at: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          color?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_at?: string
          event_type?: string
          external_id?: string | null
          external_provider?: string | null
          external_sync_token?: string | null
          id?: string
          is_active?: boolean
          is_client_visible?: boolean | null
          last_synced_at?: string | null
          location?: string | null
          matter_id?: string | null
          recurrence_exception_dates?: string[] | null
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          show_as?: string | null
          start_at?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_messages: {
        Row: {
          campaign_id: string
          clicked_at: string | null
          communication_id: string | null
          contact_id: string
          created_at: string | null
          id: string
          opened_at: string | null
          sent_at: string | null
          status: string | null
          step_index: number | null
        }
        Insert: {
          campaign_id: string
          clicked_at?: string | null
          communication_id?: string | null
          contact_id: string
          created_at?: string | null
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string | null
          step_index?: number | null
        }
        Update: {
          campaign_id?: string
          clicked_at?: string | null
          communication_id?: string | null
          contact_id?: string
          created_at?: string | null
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string | null
          step_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_profile_conflicts: {
        Row: {
          created_at: string
          existing_value: Json
          field_key: string
          id: string
          new_source: string
          new_value: Json
          profile_id: string
          resolution: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          created_at?: string
          existing_value?: Json
          field_key: string
          id?: string
          new_source: string
          new_value?: Json
          profile_id: string
          resolution?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          created_at?: string
          existing_value?: Json
          field_key?: string
          id?: string
          new_source?: string
          new_value?: Json
          profile_id?: string
          resolution?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canonical_profile_conflicts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "canonical_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_profile_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_profile_fields: {
        Row: {
          created_at: string
          domain: string
          effective_from: string
          effective_to: string | null
          field_key: string
          id: string
          profile_id: string
          source: string
          source_document_id: string | null
          updated_at: string
          value: Json
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          effective_from?: string
          effective_to?: string | null
          field_key: string
          id?: string
          profile_id: string
          source?: string
          source_document_id?: string | null
          updated_at?: string
          value?: Json
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          effective_from?: string
          effective_to?: string | null
          field_key?: string
          id?: string
          profile_id?: string
          source?: string
          source_document_id?: string | null
          updated_at?: string
          value?: Json
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canonical_profile_fields_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "canonical_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_profile_fields_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_profile_fields_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_profile_snapshots: {
        Row: {
          created_at: string
          id: string
          matter_id: string
          profile_id: string
          snapshot_data: Json
        }
        Insert: {
          created_at?: string
          id?: string
          matter_id: string
          profile_id: string
          snapshot_data?: Json
        }
        Update: {
          created_at?: string
          id?: string
          matter_id?: string
          profile_id?: string
          snapshot_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "canonical_profile_snapshots_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_profile_snapshots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "canonical_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_profiles: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_profiles_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_stage_definitions: {
        Row: {
          auto_tasks: Json
          case_type_id: string
          client_label: string | null
          color: string
          created_at: string
          description: string | null
          id: string
          is_terminal: boolean
          name: string
          notify_client_on_stage_change: boolean | null
          requires_checklist_complete: boolean
          slug: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          auto_tasks?: Json
          case_type_id: string
          client_label?: string | null
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_terminal?: boolean
          name: string
          notify_client_on_stage_change?: boolean | null
          requires_checklist_complete?: boolean
          slug: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          auto_tasks?: Json
          case_type_id?: string
          client_label?: string | null
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_terminal?: boolean
          name?: string
          notify_client_on_stage_change?: boolean | null
          requires_checklist_complete?: boolean
          slug?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_stage_definitions_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "immigration_case_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_stage_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channel_members: {
        Row: {
          channel_id: string
          id: string
          joined_at: string | null
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          channel_type: string | null
          created_at: string | null
          id: string
          matter_id: string | null
          name: string | null
          tenant_id: string
        }
        Insert: {
          channel_type?: string | null
          created_at?: string | null
          id?: string
          matter_id?: string | null
          name?: string | null
          tenant_id: string
        }
        Update: {
          channel_type?: string | null
          created_at?: string | null
          id?: string
          matter_id?: string | null
          name?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json | null
          channel_id: string
          content: string
          created_at: string | null
          document_id: string | null
          edited_at: string | null
          id: string
          is_deleted: boolean | null
          is_edited: boolean | null
          matter_id: string | null
          mentions: string[] | null
          sender_id: string
          task_id: string | null
          tenant_id: string
        }
        Insert: {
          attachments?: Json | null
          channel_id: string
          content: string
          created_at?: string | null
          document_id?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          matter_id?: string | null
          mentions?: string[] | null
          sender_id: string
          task_id?: string | null
          tenant_id: string
        }
        Update: {
          attachments?: Json | null
          channel_id?: string
          content?: string
          created_at?: string | null
          document_id?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          matter_id?: string | null
          mentions?: string[] | null
          sender_id?: string
          task_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      check_in_sessions: {
        Row: {
          booking_appointment_id: string | null
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          current_step: string
          data_safety_acknowledged: boolean | null
          device_info: Json | null
          dob_verified: boolean | null
          id: string
          id_scan_path: string | null
          id_scan_uploaded_at: string | null
          kiosk_token: string
          matter_id: string | null
          metadata: Json | null
          started_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          booking_appointment_id?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          current_step?: string
          data_safety_acknowledged?: boolean | null
          device_info?: Json | null
          dob_verified?: boolean | null
          id?: string
          id_scan_path?: string | null
          id_scan_uploaded_at?: string | null
          kiosk_token: string
          matter_id?: string | null
          metadata?: Json | null
          started_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          booking_appointment_id?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          current_step?: string
          data_safety_acknowledged?: boolean | null
          device_info?: Json | null
          dob_verified?: boolean | null
          id?: string
          id_scan_path?: string | null
          id_scan_uploaded_at?: string | null
          kiosk_token?: string
          matter_id?: string | null
          metadata?: Json | null
          started_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_in_sessions_booking_appointment_id_fkey"
            columns: ["booking_appointment_id"]
            isOneToOne: false
            referencedRelation: "booking_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_sessions_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          case_type_id: string
          category: string
          created_at: string
          description: string | null
          document_name: string
          id: string
          is_required: boolean
          sort_order: number
          tenant_id: string
        }
        Insert: {
          case_type_id: string
          category?: string
          created_at?: string
          description?: string | null
          document_name: string
          id?: string
          is_required?: boolean
          sort_order?: number
          tenant_id: string
        }
        Update: {
          case_type_id?: string
          category?: string
          created_at?: string
          description?: string | null
          document_name?: string
          id?: string
          is_required?: boolean
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "immigration_case_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      requirement_templates: {
        Row: {
          id: string
          tenant_id: string | null
          program_category: string
          jurisdiction: string
          document_name: string
          description: string | null
          category: string
          is_required: boolean
          sort_order: number
          applies_if: Json | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          program_category: string
          jurisdiction?: string
          document_name: string
          description?: string | null
          category?: string
          is_required?: boolean
          sort_order?: number
          applies_if?: Json | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          program_category?: string
          jurisdiction?: string
          document_name?: string
          description?: string | null
          category?: string
          is_required?: boolean
          sort_order?: number
          applies_if?: Json | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requirement_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cheques: {
        Row: {
          account_type: string
          amount_cents: number
          approved_by: string | null
          cheque_number: number
          cleared_date: string | null
          created_at: string
          id: string
          issued_date: string | null
          matter_id: string | null
          memo: string | null
          operating_account_id: string | null
          payee_name: string
          prepared_by: string
          printed_at: string | null
          status: string
          tenant_id: string
          trust_account_id: string | null
          trust_disbursement_request_id: string | null
          trust_transaction_id: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          account_type: string
          amount_cents: number
          approved_by?: string | null
          cheque_number: number
          cleared_date?: string | null
          created_at?: string
          id?: string
          issued_date?: string | null
          matter_id?: string | null
          memo?: string | null
          operating_account_id?: string | null
          payee_name: string
          prepared_by: string
          printed_at?: string | null
          status?: string
          tenant_id: string
          trust_account_id?: string | null
          trust_disbursement_request_id?: string | null
          trust_transaction_id?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          account_type?: string
          amount_cents?: number
          approved_by?: string | null
          cheque_number?: number
          cleared_date?: string | null
          created_at?: string
          id?: string
          issued_date?: string | null
          matter_id?: string | null
          memo?: string | null
          operating_account_id?: string | null
          payee_name?: string
          prepared_by?: string
          printed_at?: string | null
          status?: string
          tenant_id?: string
          trust_account_id?: string | null
          trust_disbursement_request_id?: string | null
          trust_transaction_id?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cheques_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_operating_account_id_fkey"
            columns: ["operating_account_id"]
            isOneToOne: false
            referencedRelation: "operating_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_trust_account_id_fkey"
            columns: ["trust_account_id"]
            isOneToOne: false
            referencedRelation: "trust_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_trust_disbursement_request_id_fkey"
            columns: ["trust_disbursement_request_id"]
            isOneToOne: false
            referencedRelation: "trust_disbursement_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_trust_transaction_id_fkey"
            columns: ["trust_transaction_id"]
            isOneToOne: false
            referencedRelation: "trust_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notifications: {
        Row: {
          body_html: string | null
          body_text: string | null
          channel: string
          contact_id: string
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          matter_id: string
          metadata: Json | null
          notification_type: string
          opened_at: string | null
          recipient_email: string | null
          resend_message_id: string | null
          sent_at: string | null
          status: string
          subject: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          channel?: string
          contact_id: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          matter_id: string
          metadata?: Json | null
          notification_type?: string
          opened_at?: string | null
          recipient_email?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          channel?: string
          contact_id?: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          matter_id?: string
          metadata?: Json | null
          notification_type?: string
          opened_at?: string | null
          recipient_email?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notifications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_actions: {
        Row: {
          action_type: string
          created_at: string
          id: string
          invoice_id: string
          is_active: boolean
          matter_id: string | null
          next_follow_up_date: string | null
          notes: string | null
          performed_at: string
          performed_by: string
          tenant_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          invoice_id: string
          is_active?: boolean
          matter_id?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          performed_at?: string
          performed_by: string
          tenant_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          invoice_id?: string
          is_active?: boolean
          matter_id?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          performed_at?: string
          performed_by?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_actions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_actions_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_actions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      common_field_registry: {
        Row: {
          canonical_key: string
          conflict_detection_rules: Json
          created_at: string
          data_type: string
          domain: string
          id: string
          is_canonical: boolean
          label: string
          mapped_form_count: number
          participant_scope: string
          source_priority: Json
          validation_rules: Json
        }
        Insert: {
          canonical_key: string
          conflict_detection_rules?: Json
          created_at?: string
          data_type?: string
          domain: string
          id?: string
          is_canonical?: boolean
          label: string
          mapped_form_count?: number
          participant_scope?: string
          source_priority?: Json
          validation_rules?: Json
        }
        Update: {
          canonical_key?: string
          conflict_detection_rules?: Json
          created_at?: string
          data_type?: string
          domain?: string
          id?: string
          is_canonical?: boolean
          label?: string
          mapped_form_count?: number
          participant_scope?: string
          source_priority?: Json
          validation_rules?: Json
        }
        Relationships: []
      }
      communication_logs: {
        Row: {
          id: string
          tenant_id: string
          matter_id: string
          sender_id: string | null
          recipient_email: string
          template_slug: string | null
          channel: string
          rendered_subject: string | null
          rendered_body: string | null
          sent_at: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          matter_id: string
          sender_id?: string | null
          recipient_email: string
          template_slug?: string | null
          channel?: string
          rendered_subject?: string | null
          rendered_body?: string | null
          sent_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          matter_id?: string
          sender_id?: string | null
          recipient_email?: string
          template_slug?: string | null
          channel?: string
          rendered_subject?: string | null
          rendered_body?: string | null
          sent_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_templates: {
        Row: {
          id: string
          tenant_id: string
          slug: string
          name: string
          subject: string
          body: string
          jurisdiction: string
          category: string
          is_system_default: boolean
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          slug: string
          name: string
          subject: string
          body: string
          jurisdiction?: string
          category?: string
          is_system_default?: boolean
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          slug?: string
          name?: string
          subject?: string
          body?: string
          jurisdiction?: string
          category?: string
          is_system_default?: boolean
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          ai_action_items: Json | null
          ai_follow_up_draft: string | null
          ai_key_points: Json | null
          ai_sentiment: string | null
          ai_summary: string | null
          bcc_addresses: string[] | null
          body: string | null
          body_html: string | null
          call_disposition: string | null
          call_duration: number | null
          call_recording_url: string | null
          call_transcript: string | null
          campaign_id: string | null
          cc_addresses: string[] | null
          channel: string
          click_count: number | null
          clicked_at: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          created_via: string | null
          direction: string
          external_message_id: string | null
          from_address: string | null
          has_attachments: boolean | null
          id: string
          matter_id: string | null
          meeting_date: string | null
          meeting_duration: number | null
          meeting_location: string | null
          meeting_recording_url: string | null
          meeting_transcript: string | null
          open_count: number | null
          opened_at: string | null
          sms_from: string | null
          sms_segments: number | null
          sms_to: string | null
          status: string | null
          subject: string | null
          tenant_id: string
          thread_id: string | null
          to_addresses: string[] | null
          updated_at: string | null
        }
        Insert: {
          ai_action_items?: Json | null
          ai_follow_up_draft?: string | null
          ai_key_points?: Json | null
          ai_sentiment?: string | null
          ai_summary?: string | null
          bcc_addresses?: string[] | null
          body?: string | null
          body_html?: string | null
          call_disposition?: string | null
          call_duration?: number | null
          call_recording_url?: string | null
          call_transcript?: string | null
          campaign_id?: string | null
          cc_addresses?: string[] | null
          channel: string
          click_count?: number | null
          clicked_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_via?: string | null
          direction?: string
          external_message_id?: string | null
          from_address?: string | null
          has_attachments?: boolean | null
          id?: string
          matter_id?: string | null
          meeting_date?: string | null
          meeting_duration?: number | null
          meeting_location?: string | null
          meeting_recording_url?: string | null
          meeting_transcript?: string | null
          open_count?: number | null
          opened_at?: string | null
          sms_from?: string | null
          sms_segments?: number | null
          sms_to?: string | null
          status?: string | null
          subject?: string | null
          tenant_id: string
          thread_id?: string | null
          to_addresses?: string[] | null
          updated_at?: string | null
        }
        Update: {
          ai_action_items?: Json | null
          ai_follow_up_draft?: string | null
          ai_key_points?: Json | null
          ai_sentiment?: string | null
          ai_summary?: string | null
          bcc_addresses?: string[] | null
          body?: string | null
          body_html?: string | null
          call_disposition?: string | null
          call_duration?: number | null
          call_recording_url?: string | null
          call_transcript?: string | null
          campaign_id?: string | null
          cc_addresses?: string[] | null
          channel?: string
          click_count?: number | null
          clicked_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_via?: string | null
          direction?: string
          external_message_id?: string | null
          from_address?: string | null
          has_attachments?: boolean | null
          id?: string
          matter_id?: string | null
          meeting_date?: string | null
          meeting_duration?: number | null
          meeting_location?: string | null
          meeting_recording_url?: string | null
          meeting_transcript?: string | null
          open_count?: number | null
          opened_at?: string | null
          sms_from?: string | null
          sms_segments?: number | null
          sms_to?: string | null
          status?: string | null
          subject?: string | null
          tenant_id?: string
          thread_id?: string | null
          to_addresses?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_genesis_metadata: {
        Row: {
          id: string
          tenant_id: string
          matter_id: string
          generated_by: string
          generated_at: string
          conflict_scan_id: string | null
          conflict_search_id: string | null
          conflict_decision: string | null
          conflict_justification: string | null
          conflict_score: number | null
          conflict_decided_at: string | null
          conflict_cleared_at: string | null
          identity_latch_hash: string | null
          kyc_verification_id: string | null
          kyc_status: string | null
          kyc_document_type: string | null
          kyc_document_hash: string | null
          kyc_verified_at: string | null
          retainer_agreement_id: string | null
          retainer_status: string | null
          retainer_signed_at: string | null
          retainer_total_cents: number | null
          retainer_hash: string | null
          initial_trust_balance: number
          last_trust_audit_hash: string | null
          genesis_payload: Record<string, unknown>
          genesis_hash: string
          trust_audit_chain_seq: number | null
          is_compliant: boolean
          has_sequence_violation: boolean
          compliance_notes: string | null
          is_revoked: boolean
          revoked_at: string | null
          revoked_by: string | null
          revocation_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          matter_id: string
          generated_by: string
          generated_at?: string
          conflict_scan_id?: string | null
          conflict_search_id?: string | null
          conflict_decision?: string | null
          conflict_justification?: string | null
          conflict_score?: number | null
          conflict_decided_at?: string | null
          conflict_cleared_at?: string | null
          identity_latch_hash?: string | null
          kyc_verification_id?: string | null
          kyc_status?: string | null
          kyc_document_type?: string | null
          kyc_document_hash?: string | null
          kyc_verified_at?: string | null
          retainer_agreement_id?: string | null
          retainer_status?: string | null
          retainer_signed_at?: string | null
          retainer_total_cents?: number | null
          retainer_hash?: string | null
          initial_trust_balance?: number
          last_trust_audit_hash?: string | null
          genesis_payload: Record<string, unknown>
          genesis_hash: string
          trust_audit_chain_seq?: number | null
          is_compliant?: boolean
          has_sequence_violation?: boolean
          compliance_notes?: string | null
          is_revoked?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          revocation_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          matter_id?: string
          generated_by?: string
          generated_at?: string
          conflict_scan_id?: string | null
          conflict_search_id?: string | null
          conflict_decision?: string | null
          conflict_justification?: string | null
          conflict_score?: number | null
          conflict_decided_at?: string | null
          conflict_cleared_at?: string | null
          identity_latch_hash?: string | null
          kyc_verification_id?: string | null
          kyc_status?: string | null
          kyc_document_type?: string | null
          kyc_document_hash?: string | null
          kyc_verified_at?: string | null
          retainer_agreement_id?: string | null
          retainer_status?: string | null
          retainer_signed_at?: string | null
          retainer_total_cents?: number | null
          retainer_hash?: string | null
          initial_trust_balance?: number
          last_trust_audit_hash?: string | null
          genesis_payload?: Record<string, unknown>
          genesis_hash?: string
          trust_audit_chain_seq?: number | null
          is_compliant?: boolean
          has_sequence_violation?: boolean
          compliance_notes?: string | null
          is_revoked?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          revocation_reason?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_genesis_metadata_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_genesis_metadata_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: true
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_genesis_metadata_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conflict_decisions: {
        Row: {
          contact_id: string
          created_at: string
          decided_by: string
          decision: string
          decision_scope: string
          id: string
          internal_note: string | null
          matter_type_id: string | null
          notes: string | null
          scan_id: string | null
          tenant_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          decided_by: string
          decision: string
          decision_scope?: string
          id?: string
          internal_note?: string | null
          matter_type_id?: string | null
          notes?: string | null
          scan_id?: string | null
          tenant_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          decided_by?: string
          decision?: string
          decision_scope?: string
          id?: string
          internal_note?: string | null
          matter_type_id?: string | null
          notes?: string | null
          scan_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conflict_decisions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_decisions_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_decisions_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "conflict_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_decisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conflict_matches: {
        Row: {
          confidence: number
          created_at: string
          id: string
          match_category: string
          match_reasons: Json
          matched_entity_id: string
          matched_entity_type: string
          matched_name: string | null
          matched_role: string | null
          scan_id: string
          tenant_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          match_category: string
          match_reasons?: Json
          matched_entity_id: string
          matched_entity_type: string
          matched_name?: string | null
          matched_role?: string | null
          scan_id: string
          tenant_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          match_category?: string
          match_reasons?: Json
          matched_entity_id?: string
          matched_entity_type?: string
          matched_name?: string | null
          matched_role?: string | null
          scan_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conflict_matches_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "conflict_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_matches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conflict_scans: {
        Row: {
          completed_at: string | null
          contact_id: string
          created_at: string
          id: string
          match_count: number
          score: number
          search_inputs: Json
          status: string
          tenant_id: string
          trigger_type: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          created_at?: string
          id?: string
          match_count?: number
          score?: number
          search_inputs?: Json
          status?: string
          tenant_id: string
          trigger_type?: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          match_count?: number
          score?: number
          search_inputs?: Json
          status?: string
          tenant_id?: string
          trigger_type?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conflict_scans_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_scans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_scans_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          contact_id: string
          created_at: string
          id: string
          is_primary: boolean
          notes: string | null
          role: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          contact_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          role?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          role?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_assignments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_relationships: {
        Row: {
          contact_id_a: string
          contact_id_b: string
          created_at: string | null
          id: string
          notes: string | null
          relationship_type: string
          reverse_type: string | null
          tenant_id: string
        }
        Insert: {
          contact_id_a: string
          contact_id_b: string
          created_at?: string | null
          id?: string
          notes?: string | null
          relationship_type: string
          reverse_type?: string | null
          tenant_id: string
        }
        Update: {
          contact_id_a?: string
          contact_id_b?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          relationship_type?: string
          reverse_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_relationships_contact_id_a_fkey"
            columns: ["contact_id_a"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_relationships_contact_id_b_fkey"
            columns: ["contact_id_b"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_relationships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_status_records: {
        Row: {
          contact_id: string
          created_at: string
          document_reference: string
          expiry_date: string
          id: string
          issue_date: string
          matter_id: string | null
          status_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          document_reference?: string
          expiry_date: string
          id?: string
          issue_date: string
          matter_id?: string | null
          status_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          document_reference?: string
          expiry_date?: string
          id?: string
          issue_date?: string
          matter_id?: string | null
          status_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_status_records_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_status_records_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_status_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          client_status: 'lead' | 'client' | 'former_client' | 'lawyer' | 'ircc_officer' | 'consultant' | 'judge' | 'referral_source' | 'government' | 'vendor' | 'other_professional'
          conflict_score: number | null
          conflict_status: string
          contact_type: string
          country: string | null
          country_of_birth: string | null
          country_of_residence: string | null
          created_at: string | null
          created_by: string | null
          criminal_charges: boolean | null
          currently_in_canada: boolean | null
          custom_fields: Json | null
          date_of_birth: string | null
          active_matter_count: number
          email_notifications_enabled: boolean | null
          email_opt_in: boolean | null
          email_primary: string | null
          email_secondary: string | null
          engagement_score: number | null
          first_name: string | null
          gender: string | null
          has_portal_access: boolean | null
          id: string
          immigration_data: Json | null
          immigration_status: string | null
          immigration_status_expiry: string | null
          inadmissibility_flag: boolean | null
          interaction_count: number | null
          is_active: boolean | null
          is_archived: boolean | null
          job_title: string | null
          last_contacted_at: string | null
          last_interaction_type: string | null
          last_name: string | null
          marital_status: string | null
          matter_type_id: string | null
          middle_name: string | null
          milestone: string
          milestone_updated_at: string | null
          nationality: string | null
          notes: string | null
          opt_in_date: string | null
          opt_in_source: string | null
          organization_id: string | null
          organization_name: string | null
          phone_primary: string | null
          phone_secondary: string | null
          phone_type_primary: string | null
          phone_type_secondary: string | null
          pipeline_stage: string
          portal_last_login: string | null
          portal_user_id: string | null
          postal_code: string | null
          preferred_language: string | null
          preferred_name: string | null
          province_state: string | null
          referred_by: string | null
          sms_opt_in: boolean | null
          source: string | null
          source_detail: string | null
          tenant_id: string
          travel_history_flag: boolean | null
          updated_at: string | null
          website: string | null
          first_name_encrypted: string | null
          last_name_encrypted: string | null
          date_of_birth_encrypted: string | null
          address_encrypted: string | null
          passport_number_encrypted: string | null
          phone_encrypted: string | null
          email_encrypted: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          client_status?: 'lead' | 'client' | 'former_client' | 'lawyer' | 'ircc_officer' | 'consultant' | 'judge' | 'referral_source' | 'government' | 'vendor' | 'other_professional'
          conflict_score?: number | null
          conflict_status?: string
          contact_type?: string
          country?: string | null
          country_of_birth?: string | null
          country_of_residence?: string | null
          created_at?: string | null
          created_by?: string | null
          criminal_charges?: boolean | null
          currently_in_canada?: boolean | null
          custom_fields?: Json | null
          date_of_birth?: string | null
          active_matter_count?: number
          email_notifications_enabled?: boolean | null
          email_opt_in?: boolean | null
          email_primary?: string | null
          email_secondary?: string | null
          engagement_score?: number | null
          first_name?: string | null
          gender?: string | null
          has_portal_access?: boolean | null
          id?: string
          immigration_data?: Json | null
          immigration_status?: string | null
          immigration_status_expiry?: string | null
          inadmissibility_flag?: boolean | null
          interaction_count?: number | null
          is_active?: boolean | null
          is_archived?: boolean | null
          job_title?: string | null
          last_contacted_at?: string | null
          last_interaction_type?: string | null
          last_name?: string | null
          marital_status?: string | null
          matter_type_id?: string | null
          middle_name?: string | null
          milestone?: string
          milestone_updated_at?: string | null
          nationality?: string | null
          notes?: string | null
          opt_in_date?: string | null
          opt_in_source?: string | null
          organization_id?: string | null
          organization_name?: string | null
          phone_primary?: string | null
          phone_secondary?: string | null
          phone_type_primary?: string | null
          phone_type_secondary?: string | null
          pipeline_stage?: string
          portal_last_login?: string | null
          portal_user_id?: string | null
          postal_code?: string | null
          preferred_language?: string | null
          preferred_name?: string | null
          province_state?: string | null
          referred_by?: string | null
          sms_opt_in?: boolean | null
          source?: string | null
          source_detail?: string | null
          tenant_id: string
          travel_history_flag?: boolean | null
          updated_at?: string | null
          website?: string | null
          first_name_encrypted?: string | null
          last_name_encrypted?: string | null
          date_of_birth_encrypted?: string | null
          address_encrypted?: string | null
          passport_number_encrypted?: string | null
          phone_encrypted?: string | null
          email_encrypted?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          client_status?: 'lead' | 'client' | 'former_client' | 'lawyer' | 'ircc_officer' | 'consultant' | 'judge' | 'referral_source' | 'government' | 'vendor' | 'other_professional'
          conflict_score?: number | null
          conflict_status?: string
          contact_type?: string
          country?: string | null
          country_of_birth?: string | null
          country_of_residence?: string | null
          created_at?: string | null
          created_by?: string | null
          criminal_charges?: boolean | null
          currently_in_canada?: boolean | null
          custom_fields?: Json | null
          date_of_birth?: string | null
          active_matter_count?: number
          email_notifications_enabled?: boolean | null
          email_opt_in?: boolean | null
          email_primary?: string | null
          email_secondary?: string | null
          engagement_score?: number | null
          first_name?: string | null
          gender?: string | null
          has_portal_access?: boolean | null
          id?: string
          immigration_data?: Json | null
          immigration_status?: string | null
          immigration_status_expiry?: string | null
          inadmissibility_flag?: boolean | null
          interaction_count?: number | null
          is_active?: boolean | null
          is_archived?: boolean | null
          job_title?: string | null
          last_contacted_at?: string | null
          last_interaction_type?: string | null
          last_name?: string | null
          marital_status?: string | null
          matter_type_id?: string | null
          middle_name?: string | null
          milestone?: string
          milestone_updated_at?: string | null
          nationality?: string | null
          notes?: string | null
          opt_in_date?: string | null
          opt_in_source?: string | null
          organization_id?: string | null
          organization_name?: string | null
          phone_primary?: string | null
          phone_secondary?: string | null
          phone_type_primary?: string | null
          phone_type_secondary?: string | null
          pipeline_stage?: string
          portal_last_login?: string | null
          portal_user_id?: string | null
          postal_code?: string | null
          preferred_language?: string | null
          preferred_name?: string | null
          province_state?: string | null
          referred_by?: string | null
          sms_opt_in?: boolean | null
          source?: string | null
          source_detail?: string | null
          tenant_id?: string
          travel_history_flag?: boolean | null
          updated_at?: string | null
          website?: string | null
          first_name_encrypted?: string | null
          last_name_encrypted?: string | null
          date_of_birth_encrypted?: string | null
          address_encrypted?: string | null
          passport_number_encrypted?: string | null
          phone_encrypted?: string | null
          email_encrypted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          contact_id: string
          contract_type: string
          countersigned_at: string | null
          created_at: string | null
          created_by: string | null
          document_id: string | null
          effective_date: string | null
          expiry_date: string | null
          id: string
          matter_id: string | null
          on_sign_create_matter: boolean | null
          on_sign_pipeline_id: string | null
          on_sign_practice_area_id: string | null
          retainer_amount: number | null
          sent_at: string | null
          signed_at: string | null
          status: string | null
          template_id: string | null
          tenant_id: string
          title: string
          updated_at: string | null
          viewed_at: string | null
        }
        Insert: {
          contact_id: string
          contract_type: string
          countersigned_at?: string | null
          created_at?: string | null
          created_by?: string | null
          document_id?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          id?: string
          matter_id?: string | null
          on_sign_create_matter?: boolean | null
          on_sign_pipeline_id?: string | null
          on_sign_practice_area_id?: string | null
          retainer_amount?: number | null
          sent_at?: string | null
          signed_at?: string | null
          status?: string | null
          template_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string | null
          viewed_at?: string | null
        }
        Update: {
          contact_id?: string
          contract_type?: string
          countersigned_at?: string | null
          created_at?: string | null
          created_by?: string | null
          document_id?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          id?: string
          matter_id?: string | null
          on_sign_create_matter?: boolean | null
          on_sign_pipeline_id?: string | null
          on_sign_practice_area_id?: string | null
          retainer_amount?: number | null
          sent_at?: string | null
          signed_at?: string | null
          status?: string | null
          template_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_on_sign_pipeline_id_fkey"
            columns: ["on_sign_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_on_sign_practice_area_id_fkey"
            columns: ["on_sign_practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          created_at: string | null
          default_value: string | null
          entity_type: string
          field_key: string
          field_label: string
          field_type: string
          id: string
          is_active: boolean | null
          is_required: boolean | null
          options: Json | null
          practice_area_id: string | null
          show_in_table: boolean | null
          show_on_card: boolean | null
          sort_order: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          default_value?: string | null
          entity_type: string
          field_key: string
          field_label: string
          field_type: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          options?: Json | null
          practice_area_id?: string | null
          show_in_table?: boolean | null
          show_on_card?: boolean | null
          sort_order?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          default_value?: string | null
          entity_type?: string
          field_key?: string
          field_label?: string
          field_type?: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          options?: Json | null
          practice_area_id?: string | null
          show_in_table?: boolean | null
          show_on_card?: boolean | null
          sort_order?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_types: {
        Row: {
          color: string
          created_at: string
          default_days_offset: number | null
          description: string | null
          id: string
          is_active: boolean
          is_hard: boolean
          matter_type_id: string | null
          name: string
          practice_area_id: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          default_days_offset?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_hard?: boolean
          matter_type_id?: string | null
          name: string
          practice_area_id?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          default_days_offset?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_hard?: boolean
          matter_type_id?: string | null
          name?: string
          practice_area_id?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_types_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_types_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      disbursement_categories: {
        Row: {
          code: string
          created_at: string
          default_is_recoverable: boolean
          default_is_taxable: boolean
          id: string
          is_active: boolean
          label: string
          tenant_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          default_is_recoverable?: boolean
          default_is_taxable?: boolean
          id?: string
          is_active?: boolean
          label: string
          tenant_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          default_is_recoverable?: boolean
          default_is_taxable?: boolean
          id?: string
          is_active?: boolean
          label?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disbursement_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_approval_thresholds: {
        Row: {
          applies_to_adjustment_types: string[]
          approver_role: string
          created_at: string
          id: string
          is_active: boolean
          tenant_id: string
          threshold_type: string
          threshold_value: number
        }
        Insert: {
          applies_to_adjustment_types?: string[]
          approver_role: string
          created_at?: string
          id?: string
          is_active?: boolean
          tenant_id: string
          threshold_type: string
          threshold_value: number
        }
        Update: {
          applies_to_adjustment_types?: string[]
          approver_role?: string
          created_at?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
          threshold_type?: string
          threshold_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "discount_approval_thresholds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dob_lockouts: {
        Row: {
          attempts: number
          contact_id: string
          created_at: string
          id: string
          last_attempt_at: string
          locked_until: string | null
          tenant_id: string
        }
        Insert: {
          attempts?: number
          contact_id: string
          created_at?: string
          id?: string
          last_attempt_at?: string
          locked_until?: string | null
          tenant_id: string
        }
        Update: {
          attempts?: number
          contact_id?: string
          created_at?: string
          id?: string
          last_attempt_at?: string
          locked_until?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dob_lockouts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dob_lockouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      docgen_templates: {
        Row: {
          created_at: string
          created_by: string | null
          current_version_id: string | null
          description: string | null
          document_family: string
          generation_tier: string
          id: string
          is_active: boolean
          is_system_template: boolean
          jurisdiction_code: string
          language_code: string
          matter_type_id: string | null
          name: string
          practice_area: string | null
          requires_review: boolean
          sort_order: number
          status: Database["public"]["Enums"]["doc_template_status"]
          template_key: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          description?: string | null
          document_family: string
          generation_tier?: string
          id?: string
          is_active?: boolean
          is_system_template?: boolean
          jurisdiction_code?: string
          language_code?: string
          matter_type_id?: string | null
          name: string
          practice_area?: string | null
          requires_review?: boolean
          sort_order?: number
          status?: Database["public"]["Enums"]["doc_template_status"]
          template_key: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          description?: string | null
          document_family?: string
          generation_tier?: string
          id?: string
          is_active?: boolean
          is_system_template?: boolean
          jurisdiction_code?: string
          language_code?: string
          matter_type_id?: string | null
          name?: string
          practice_area?: string | null
          requires_review?: boolean
          sort_order?: number
          status?: Database["public"]["Enums"]["doc_template_status"]
          template_key?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "docgen_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docgen_templates_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docgen_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docgen_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_docgen_templates_current_version"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "document_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_artifacts: {
        Row: {
          artifact_type: string
          checksum_sha256: string
          created_at: string
          created_by: string | null
          file_name: string
          file_size: number
          file_type: string
          id: string
          instance_id: string
          is_final: boolean
          storage_path: string
          tenant_id: string
        }
        Insert: {
          artifact_type: string
          checksum_sha256: string
          created_at?: string
          created_by?: string | null
          file_name: string
          file_size: number
          file_type?: string
          id?: string
          instance_id: string
          is_final?: boolean
          storage_path: string
          tenant_id: string
        }
        Update: {
          artifact_type?: string
          checksum_sha256?: string
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          instance_id?: string
          is_final?: boolean
          storage_path?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_artifacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_artifacts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "document_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_artifacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_clause_assignments: {
        Row: {
          clause_id: string
          condition_id: string | null
          created_at: string
          id: string
          is_required: boolean
          placement_key: string
          sort_order: number
          template_version_id: string
          tenant_id: string
        }
        Insert: {
          clause_id: string
          condition_id?: string | null
          created_at?: string
          id?: string
          is_required?: boolean
          placement_key: string
          sort_order?: number
          template_version_id: string
          tenant_id: string
        }
        Update: {
          clause_id?: string
          condition_id?: string | null
          created_at?: string
          id?: string
          is_required?: boolean
          placement_key?: string
          sort_order?: number
          template_version_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_clause_assignments_clause_id_fkey"
            columns: ["clause_id"]
            isOneToOne: false
            referencedRelation: "document_clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_clause_assignments_condition_id_fkey"
            columns: ["condition_id"]
            isOneToOne: false
            referencedRelation: "document_template_conditions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_clause_assignments_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "document_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_clause_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_clauses: {
        Row: {
          clause_key: string
          content: string
          created_at: string
          created_by: string | null
          description: string | null
          document_family: string | null
          id: string
          is_active: boolean
          jurisdiction_code: string
          language_code: string
          name: string
          practice_area: string | null
          status: Database["public"]["Enums"]["doc_template_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version_number: number
        }
        Insert: {
          clause_key: string
          content: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_family?: string | null
          id?: string
          is_active?: boolean
          jurisdiction_code?: string
          language_code?: string
          name: string
          practice_area?: string | null
          status?: Database["public"]["Enums"]["doc_template_status"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version_number?: number
        }
        Update: {
          clause_key?: string
          content?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_family?: string | null
          id?: string
          is_active?: boolean
          jurisdiction_code?: string
          language_code?: string
          name?: string
          practice_area?: string | null
          status?: Database["public"]["Enums"]["doc_template_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_clauses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_clauses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_clauses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      document_folders: {
        Row: {
          created_at: string | null
          id: string
          matter_id: string | null
          name: string
          parent_folder_id: string | null
          sort_order: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          matter_id?: string | null
          name: string
          parent_folder_id?: string | null
          sort_order?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          matter_id?: string | null
          name?: string
          parent_folder_id?: string | null
          sort_order?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_instance_fields: {
        Row: {
          created_at: string
          document_instance_id: string
          field_key: string
          id: string
          resolution_status: string
          resolved_value_json: Json | null
          resolved_value_text: string | null
          source_path: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          document_instance_id: string
          field_key: string
          id?: string
          resolution_status?: string
          resolved_value_json?: Json | null
          resolved_value_text?: string | null
          source_path?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          document_instance_id?: string
          field_key?: string
          id?: string
          resolution_status?: string
          resolved_value_json?: Json | null
          resolved_value_text?: string | null
          source_path?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_instance_fields_document_instance_id_fkey"
            columns: ["document_instance_id"]
            isOneToOne: false
            referencedRelation: "document_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instance_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_instances: {
        Row: {
          contact_id: string | null
          created_at: string
          document_family: string
          generated_by: string | null
          generation_mode: Database["public"]["Enums"]["doc_generation_mode"]
          id: string
          is_active: boolean
          jurisdiction_code: string
          latest_artifact_id: string | null
          latest_signature_request_id: string | null
          matter_id: string | null
          source_snapshot_json: Json
          status: Database["public"]["Enums"]["doc_instance_status"]
          supersedes_instance_id: string | null
          template_id: string
          template_version_id: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          document_family: string
          generated_by?: string | null
          generation_mode?: Database["public"]["Enums"]["doc_generation_mode"]
          id?: string
          is_active?: boolean
          jurisdiction_code?: string
          latest_artifact_id?: string | null
          latest_signature_request_id?: string | null
          matter_id?: string | null
          source_snapshot_json?: Json
          status?: Database["public"]["Enums"]["doc_instance_status"]
          supersedes_instance_id?: string | null
          template_id: string
          template_version_id: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          document_family?: string
          generated_by?: string | null
          generation_mode?: Database["public"]["Enums"]["doc_generation_mode"]
          id?: string
          is_active?: boolean
          jurisdiction_code?: string
          latest_artifact_id?: string | null
          latest_signature_request_id?: string | null
          matter_id?: string | null
          source_snapshot_json?: Json
          status?: Database["public"]["Enums"]["doc_instance_status"]
          supersedes_instance_id?: string | null
          template_id?: string
          template_version_id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_instances_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_supersedes_instance_id_fkey"
            columns: ["supersedes_instance_id"]
            isOneToOne: false
            referencedRelation: "document_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "docgen_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "document_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_document_instances_latest_artifact"
            columns: ["latest_artifact_id"]
            isOneToOne: false
            referencedRelation: "document_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_document_instances_latest_signature_request"
            columns: ["latest_signature_request_id"]
            isOneToOne: false
            referencedRelation: "document_signature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      document_reminder_configs: {
        Row: {
          created_at: string
          escalation_after_days: number | null
          id: string
          is_active: boolean | null
          matter_type_id: string | null
          max_reminders: number | null
          quiet_hours_end: number | null
          quiet_hours_start: number | null
          schedule_days: number[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          escalation_after_days?: number | null
          id?: string
          is_active?: boolean | null
          matter_type_id?: string | null
          max_reminders?: number | null
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          schedule_days?: number[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          escalation_after_days?: number | null
          id?: string
          is_active?: boolean | null
          matter_type_id?: string | null
          max_reminders?: number | null
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          schedule_days?: number[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_reminder_configs_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_reminder_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_reminders: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          matter_id: string
          notification_id: string | null
          outstanding_slot_ids: string[]
          outstanding_slot_names: string[]
          reminder_number: number
          reminder_type: string
          sent_at: string
          tenant_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          matter_id: string
          notification_id?: string | null
          outstanding_slot_ids: string[]
          outstanding_slot_names: string[]
          reminder_number: number
          reminder_type?: string
          sent_at?: string
          tenant_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          matter_id?: string
          notification_id?: string | null
          outstanding_slot_ids?: string[]
          outstanding_slot_names?: string[]
          reminder_number?: number
          reminder_type?: string
          sent_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_reminders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_reminders_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_reminders_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "client_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requests: {
        Row: {
          auto_remind: boolean | null
          contact_id: string
          created_at: string | null
          description: string | null
          document_id: string | null
          due_date: string | null
          id: string
          last_reminder_at: string | null
          matter_id: string
          max_reminders: number | null
          remind_interval_days: number | null
          reminder_count: number | null
          requested_by: string | null
          status: string | null
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          auto_remind?: boolean | null
          contact_id: string
          created_at?: string | null
          description?: string | null
          document_id?: string | null
          due_date?: string | null
          id?: string
          last_reminder_at?: string | null
          matter_id: string
          max_reminders?: number | null
          remind_interval_days?: number | null
          reminder_count?: number | null
          requested_by?: string | null
          status?: string | null
          tenant_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          auto_remind?: boolean | null
          contact_id?: string
          created_at?: string | null
          description?: string | null
          document_id?: string | null
          due_date?: string | null
          id?: string
          last_reminder_at?: string | null
          matter_id?: string
          max_reminders?: number | null
          remind_interval_days?: number | null
          reminder_count?: number | null
          requested_by?: string | null
          status?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_requests_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signature_requests: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          document_instance_id: string
          expires_at: string | null
          id: string
          last_reminder_at: string | null
          provider: string
          provider_request_id: string | null
          reminder_count: number
          sent_at: string | null
          status: Database["public"]["Enums"]["doc_signature_request_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_instance_id: string
          expires_at?: string | null
          id?: string
          last_reminder_at?: string | null
          provider?: string
          provider_request_id?: string | null
          reminder_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["doc_signature_request_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_instance_id?: string
          expires_at?: string | null
          id?: string
          last_reminder_at?: string | null
          provider?: string
          provider_request_id?: string | null
          reminder_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["doc_signature_request_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_signature_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signature_requests_document_instance_id_fkey"
            columns: ["document_instance_id"]
            isOneToOne: false
            referencedRelation: "document_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signature_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signer_events: {
        Row: {
          event_type: string
          from_status: string | null
          id: string
          note: string | null
          performed_at: string
          performed_by: string | null
          request_id: string
          signer_id: string
          tenant_id: string
          to_status: string | null
        }
        Insert: {
          event_type: string
          from_status?: string | null
          id?: string
          note?: string | null
          performed_at?: string
          performed_by?: string | null
          request_id: string
          signer_id: string
          tenant_id: string
          to_status?: string | null
        }
        Update: {
          event_type?: string
          from_status?: string | null
          id?: string
          note?: string | null
          performed_at?: string
          performed_by?: string | null
          request_id?: string
          signer_id?: string
          tenant_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_signer_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signer_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "document_signature_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signer_events_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "document_signers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signer_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signers: {
        Row: {
          contact_id: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          email: string
          id: string
          name: string
          provider_signer_id: string | null
          role_key: string
          signature_request_id: string
          signed_at: string | null
          signing_order: number
          status: Database["public"]["Enums"]["doc_signer_status"]
          tenant_id: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          email: string
          id?: string
          name: string
          provider_signer_id?: string | null
          role_key: string
          signature_request_id: string
          signed_at?: string | null
          signing_order?: number
          status?: Database["public"]["Enums"]["doc_signer_status"]
          tenant_id: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          email?: string
          id?: string
          name?: string
          provider_signer_id?: string | null
          role_key?: string
          signature_request_id?: string
          signed_at?: string | null
          signing_order?: number
          status?: Database["public"]["Enums"]["doc_signer_status"]
          tenant_id?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_signers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signers_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "document_signature_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_slot_templates: {
        Row: {
          accepted_file_types: string[] | null
          case_type_id: string | null
          category: string
          conditions: Json | null
          created_at: string
          description: string | null
          description_translations: Json | null
          folder_template_id: string | null
          id: string
          is_active: boolean
          is_required: boolean
          library_slot_id: string | null
          matter_type_id: string | null
          max_file_size_bytes: number | null
          person_role_scope: string | null
          slot_name: string
          slot_slug: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accepted_file_types?: string[] | null
          case_type_id?: string | null
          category?: string
          conditions?: Json | null
          created_at?: string
          description?: string | null
          description_translations?: Json | null
          folder_template_id?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          library_slot_id?: string | null
          matter_type_id?: string | null
          max_file_size_bytes?: number | null
          person_role_scope?: string | null
          slot_name: string
          slot_slug: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accepted_file_types?: string[] | null
          case_type_id?: string | null
          category?: string
          conditions?: Json | null
          created_at?: string
          description?: string | null
          description_translations?: Json | null
          folder_template_id?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          library_slot_id?: string | null
          matter_type_id?: string | null
          max_file_size_bytes?: number | null
          person_role_scope?: string | null
          slot_name?: string
          slot_slug?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_slot_templates_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "immigration_case_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_slot_templates_folder_template_id_fkey"
            columns: ["folder_template_id"]
            isOneToOne: false
            referencedRelation: "matter_folder_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_slot_templates_library_slot_id_fkey"
            columns: ["library_slot_id"]
            isOneToOne: false
            referencedRelation: "tenant_document_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_slot_templates_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_slot_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_slots: {
        Row: {
          accepted_file_types: string[] | null
          category: string
          created_at: string
          current_document_id: string | null
          current_version: number
          deactivated_at: string | null
          description: string | null
          folder_id: string | null
          id: string
          is_active: boolean
          is_required: boolean
          matter_id: string
          max_file_size_bytes: number | null
          person_id: string | null
          person_role: string | null
          slot_name: string
          slot_slug: string
          slot_template_id: string | null
          expiry_date: string | null
          sort_order: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accepted_file_types?: string[] | null
          category?: string
          created_at?: string
          current_document_id?: string | null
          current_version?: number
          deactivated_at?: string | null
          description?: string | null
          expiry_date?: string | null
          folder_id?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          matter_id: string
          max_file_size_bytes?: number | null
          person_id?: string | null
          person_role?: string | null
          slot_name: string
          slot_slug: string
          slot_template_id?: string | null
          sort_order?: number
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accepted_file_types?: string[] | null
          category?: string
          created_at?: string
          current_document_id?: string | null
          current_version?: number
          deactivated_at?: string | null
          description?: string | null
          expiry_date?: string | null
          folder_id?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          matter_id?: string
          max_file_size_bytes?: number | null
          person_id?: string | null
          person_role?: string | null
          slot_name?: string
          slot_slug?: string
          slot_template_id?: string | null
          sort_order?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_slots_current_document_id_fkey"
            columns: ["current_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_slots_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "matter_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_slots_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_slots_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "matter_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_slots_slot_template_id_fkey"
            columns: ["slot_template_id"]
            isOneToOne: false
            referencedRelation: "document_slot_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_slots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_status_events: {
        Row: {
          document_instance_id: string
          event_payload_json: Json
          event_type: string
          from_status: string | null
          id: string
          performed_at: string
          performed_by: string | null
          tenant_id: string
          to_status: string | null
        }
        Insert: {
          document_instance_id: string
          event_payload_json?: Json
          event_type: string
          from_status?: string | null
          id?: string
          performed_at?: string
          performed_by?: string | null
          tenant_id: string
          to_status?: string | null
        }
        Update: {
          document_instance_id?: string
          event_payload_json?: Json
          event_type?: string
          from_status?: string | null
          id?: string
          performed_at?: string
          performed_by?: string | null
          tenant_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_status_events_document_instance_id_fkey"
            columns: ["document_instance_id"]
            isOneToOne: false
            referencedRelation: "document_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_status_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_status_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_template_audit_log: {
        Row: {
          event_payload_json: Json
          event_type: string
          id: string
          performed_at: string
          performed_by: string | null
          template_id: string
          template_version_id: string | null
          tenant_id: string
        }
        Insert: {
          event_payload_json?: Json
          event_type: string
          id?: string
          performed_at?: string
          performed_by?: string | null
          template_id: string
          template_version_id?: string | null
          tenant_id: string
        }
        Update: {
          event_payload_json?: Json
          event_type?: string
          id?: string
          performed_at?: string
          performed_by?: string | null
          template_id?: string
          template_version_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_template_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_audit_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "docgen_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_audit_log_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "document_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_template_conditions: {
        Row: {
          condition_key: string
          created_at: string
          evaluation_order: number
          id: string
          label: string
          logic_operator: string
          rules: Json
          template_version_id: string
          tenant_id: string
        }
        Insert: {
          condition_key: string
          created_at?: string
          evaluation_order?: number
          id?: string
          label: string
          logic_operator?: string
          rules: Json
          template_version_id: string
          tenant_id: string
        }
        Update: {
          condition_key?: string
          created_at?: string
          evaluation_order?: number
          id?: string
          label?: string
          logic_operator?: string
          rules?: Json
          template_version_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_template_conditions_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "document_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_conditions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_template_mappings: {
        Row: {
          created_at: string
          default_value: string | null
          display_name: string
          fallback_rule: string | null
          field_key: string
          field_type: Database["public"]["Enums"]["doc_field_type"]
          format_rule: string | null
          id: string
          is_required: boolean
          max_length: number | null
          sort_order: number
          source_entity: string
          source_path: string
          template_version_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          default_value?: string | null
          display_name: string
          fallback_rule?: string | null
          field_key: string
          field_type?: Database["public"]["Enums"]["doc_field_type"]
          format_rule?: string | null
          id?: string
          is_required?: boolean
          max_length?: number | null
          sort_order?: number
          source_entity: string
          source_path: string
          template_version_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          default_value?: string | null
          display_name?: string
          fallback_rule?: string | null
          field_key?: string
          field_type?: Database["public"]["Enums"]["doc_field_type"]
          format_rule?: string | null
          id?: string
          is_required?: boolean
          max_length?: number | null
          sort_order?: number
          source_entity?: string
          source_path?: string
          template_version_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_template_mappings_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "document_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_template_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["doc_template_status"]
          template_body: Json
          template_id: string
          tenant_id: string
          version_label: string | null
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["doc_template_status"]
          template_body: Json
          template_id: string
          tenant_id: string
          version_label?: string | null
          version_number: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["doc_template_status"]
          template_body?: Json
          template_id?: string
          tenant_id?: string
          version_label?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "docgen_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          merge_fields: Json | null
          name: string
          practice_area_id: string | null
          storage_path: string
          template_type: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          merge_fields?: Json | null
          name: string
          practice_area_id?: string | null
          storage_path: string
          template_type?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          merge_fields?: Json | null
          name?: string
          practice_area_id?: string | null
          storage_path?: string
          template_type?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string
          document_id: string
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          rejection_reason_code: string | null
          review_reason: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          slot_id: string
          storage_path: string
          tenant_id: string
          uploaded_by: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          document_id: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          rejection_reason_code?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          slot_id: string
          storage_path: string
          tenant_id: string
          uploaded_by?: string | null
          version_number: number
        }
        Update: {
          created_at?: string
          document_id?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          rejection_reason_code?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          slot_id?: string
          storage_path?: string
          tenant_id?: string
          uploaded_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "document_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      document_workflow_rules: {
        Row: {
          auto_generate: boolean
          auto_send_for_signature: boolean
          created_at: string
          created_by: string | null
          description: string | null
          document_family: string
          id: string
          is_active: boolean
          jurisdiction_code: string | null
          matter_type_id: string | null
          name: string
          practice_area: string | null
          status: string
          template_id: string
          tenant_id: string
          trigger_config_json: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          auto_generate?: boolean
          auto_send_for_signature?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_family: string
          id?: string
          is_active?: boolean
          jurisdiction_code?: string | null
          matter_type_id?: string | null
          name: string
          practice_area?: string | null
          status?: string
          template_id: string
          tenant_id: string
          trigger_config_json?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          auto_generate?: boolean
          auto_send_for_signature?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_family?: string
          id?: string
          is_active?: boolean
          jurisdiction_code?: string | null
          matter_type_id?: string | null
          name?: string
          practice_area?: string | null
          status?: string
          template_id?: string
          tenant_id?: string
          trigger_config_json?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_workflow_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_workflow_rules_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_workflow_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "docgen_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_workflow_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          ai_extracted_data: Json | null
          ai_summary: string | null
          category: string
          contact_id: string | null
          created_at: string | null
          description: string | null
          document_type: string | null
          external_id: string | null
          external_provider: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          folder_id: string | null
          id: string
          is_archived: boolean
          lead_id: string | null
          matter_id: string | null
          ocr_text: string | null
          onedrive_item_id: string | null
          onedrive_web_url: string | null
          parent_document_id: string | null
          requires_signature: boolean | null
          review_notes: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          signature_provider: string | null
          signature_request_id: string | null
          signature_status: string | null
          signed_at: string | null
          storage_bucket: string | null
          storage_path: string
          tags: string[] | null
          task_id: string | null
          tenant_id: string
          updated_at: string | null
          uploaded_by: string | null
          version: number | null
          content_hash: string | null
          hash_verified_at: string | null
          tamper_status: string | null
        }
        Insert: {
          ai_extracted_data?: Json | null
          ai_summary?: string | null
          category?: string
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          document_type?: string | null
          external_id?: string | null
          external_provider?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          lead_id?: string | null
          matter_id?: string | null
          ocr_text?: string | null
          onedrive_item_id?: string | null
          onedrive_web_url?: string | null
          parent_document_id?: string | null
          requires_signature?: boolean | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signature_provider?: string | null
          signature_request_id?: string | null
          signature_status?: string | null
          signed_at?: string | null
          storage_bucket?: string | null
          storage_path: string
          tags?: string[] | null
          task_id?: string | null
          tenant_id: string
          updated_at?: string | null
          uploaded_by?: string | null
          version?: number | null
          content_hash?: string | null
          hash_verified_at?: string | null
          tamper_status?: string | null
        }
        Update: {
          ai_extracted_data?: Json | null
          ai_summary?: string | null
          category?: string
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          document_type?: string | null
          external_id?: string | null
          external_provider?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          lead_id?: string | null
          matter_id?: string | null
          ocr_text?: string | null
          onedrive_item_id?: string | null
          onedrive_web_url?: string | null
          parent_document_id?: string | null
          requires_signature?: boolean | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signature_provider?: string | null
          signature_request_id?: string | null
          signature_status?: string | null
          signed_at?: string | null
          storage_bucket?: string | null
          storage_path?: string
          tags?: string[] | null
          task_id?: string | null
          tenant_id?: string
          updated_at?: string | null
          uploaded_by?: string | null
          version?: number | null
          content_hash?: string | null
          hash_verified_at?: string | null
          tamper_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      drafting_prep_questions: {
        Row: {
          applies_when: Json | null
          created_at: string
          display_order: number
          id: string
          is_required: boolean
          matter_type_id: string | null
          question_key: string
          question_text: string
          tenant_id: string
        }
        Insert: {
          applies_when?: Json | null
          created_at?: string
          display_order?: number
          id?: string
          is_required?: boolean
          matter_type_id?: string | null
          question_key: string
          question_text: string
          tenant_id: string
        }
        Update: {
          applies_when?: Json | null
          created_at?: string
          display_order?: number
          id?: string
          is_required?: boolean
          matter_type_id?: string | null
          question_key?: string
          question_text?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drafting_prep_questions_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafting_prep_questions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      drafting_prep_responses: {
        Row: {
          created_at: string
          id: string
          matter_id: string
          question_id: string
          responded_at: string
          responded_by: string
          response: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          matter_id: string
          question_id: string
          responded_at?: string
          responded_by: string
          response?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          matter_id?: string
          question_id?: string
          responded_at?: string
          responded_by?: string
          response?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drafting_prep_responses_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafting_prep_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "drafting_prep_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafting_prep_responses_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafting_prep_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_account_access: {
        Row: {
          access_level: string
          email_account_id: string
          granted_at: string
          granted_by: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          access_level: string
          email_account_id: string
          granted_at?: string
          granted_by: string
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          access_level?: string
          email_account_id?: string
          granted_at?: string
          granted_by?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_account_access_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_account_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_account_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_account_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          account_type: string
          authorized_user_ids: string[] | null
          created_at: string
          delta_link: string | null
          display_name: string | null
          email_address: string
          encrypted_access_token: string
          encrypted_refresh_token: string
          error_count: number
          id: string
          is_active: boolean
          last_error: string | null
          last_sync_at: string | null
          practice_area_id: string | null
          provider: string
          sync_enabled: boolean
          tenant_id: string
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type: string
          authorized_user_ids?: string[] | null
          created_at?: string
          delta_link?: string | null
          display_name?: string | null
          email_address: string
          encrypted_access_token: string
          encrypted_refresh_token: string
          error_count?: number
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          practice_area_id?: string | null
          provider: string
          sync_enabled?: boolean
          tenant_id: string
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          authorized_user_ids?: string[] | null
          created_at?: string
          delta_link?: string | null
          display_name?: string | null
          email_address?: string
          encrypted_access_token?: string
          encrypted_refresh_token?: string
          error_count?: number
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          practice_area_id?: string | null
          provider?: string
          sync_enabled?: boolean
          tenant_id?: string
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_accounts_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_association_events: {
        Row: {
          associated_by: string
          association_type: string
          confidence_score: number | null
          created_at: string
          id: string
          matter_id: string
          previous_matter_id: string | null
          tenant_id: string
          thread_id: string
        }
        Insert: {
          associated_by: string
          association_type: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          matter_id: string
          previous_matter_id?: string | null
          tenant_id: string
          thread_id: string
        }
        Update: {
          associated_by?: string
          association_type?: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          matter_id?: string
          previous_matter_id?: string | null
          tenant_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_association_events_associated_by_fkey"
            columns: ["associated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_association_events_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_association_events_previous_matter_id_fkey"
            columns: ["previous_matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_association_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_association_events_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          external_attachment_id: string | null
          filename: string
          id: string
          message_id: string
          size_bytes: number | null
          storage_path: string | null
          tenant_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          external_attachment_id?: string | null
          filename: string
          id?: string
          message_id: string
          size_bytes?: number | null
          storage_path?: string | null
          tenant_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          external_attachment_id?: string | null
          filename?: string
          id?: string
          message_id?: string
          size_bytes?: number | null
          storage_path?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_ghost_drafts: {
        Row: {
          id: string
          tenant_id: string
          email_thread_id: string
          email_message_id: string | null
          matter_id: string
          draft_subject: string | null
          draft_body_text: string
          draft_body_html: string | null
          model: string
          tokens_input: number | null
          tokens_output: number | null
          duration_ms: number | null
          status: 'generating' | 'generated' | 'reviewed' | 'sent' | 'discarded'
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          email_thread_id: string
          email_message_id?: string | null
          matter_id: string
          draft_subject?: string | null
          draft_body_text: string
          draft_body_html?: string | null
          model?: string
          tokens_input?: number | null
          tokens_output?: number | null
          duration_ms?: number | null
          status?: 'generating' | 'generated' | 'reviewed' | 'sent' | 'discarded'
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          email_thread_id?: string
          email_message_id?: string | null
          matter_id?: string
          draft_subject?: string | null
          draft_body_text?: string
          draft_body_html?: string | null
          model?: string
          tokens_input?: number | null
          tokens_output?: number | null
          duration_ms?: number | null
          status?: 'generating' | 'generated' | 'reviewed' | 'sent' | 'discarded'
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          bcc_addresses: string[] | null
          body: string | null
          cc_addresses: string[] | null
          contact_id: string | null
          created_at: string
          direction: string
          external_message_id: string | null
          from_address: string
          id: string
          is_active: boolean
          logged_by: string
          matter_id: string | null
          sent_at: string
          subject: string
          tenant_id: string
          to_addresses: string[]
        }
        Insert: {
          bcc_addresses?: string[] | null
          body?: string | null
          cc_addresses?: string[] | null
          contact_id?: string | null
          created_at?: string
          direction: string
          external_message_id?: string | null
          from_address: string
          id?: string
          is_active?: boolean
          logged_by: string
          matter_id?: string | null
          sent_at?: string
          subject: string
          tenant_id: string
          to_addresses: string[]
        }
        Update: {
          bcc_addresses?: string[] | null
          body?: string | null
          cc_addresses?: string[] | null
          contact_id?: string | null
          created_at?: string
          direction?: string
          external_message_id?: string | null
          from_address?: string
          id?: string
          is_active?: boolean
          logged_by?: string
          matter_id?: string | null
          sent_at?: string
          subject?: string
          tenant_id?: string
          to_addresses?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          bcc_addresses: Json | null
          body_html: string | null
          body_text: string | null
          cc_addresses: Json | null
          created_at: string
          direction: string
          email_account_id: string
          from_address: string | null
          from_name: string | null
          has_attachments: boolean
          id: string
          importance: string
          is_read: boolean
          message_id: string
          received_at: string | null
          sent_at: string | null
          subject: string | null
          synced_at: string
          tenant_id: string
          thread_id: string
          to_addresses: Json | null
        }
        Insert: {
          bcc_addresses?: Json | null
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: Json | null
          created_at?: string
          direction: string
          email_account_id: string
          from_address?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          importance?: string
          is_read?: boolean
          message_id: string
          received_at?: string | null
          sent_at?: string | null
          subject?: string | null
          synced_at?: string
          tenant_id: string
          thread_id: string
          to_addresses?: Json | null
        }
        Update: {
          bcc_addresses?: Json | null
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: Json | null
          created_at?: string
          direction?: string
          email_account_id?: string
          from_address?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          importance?: string
          is_read?: boolean
          message_id?: string
          received_at?: string | null
          sent_at?: string | null
          subject?: string | null
          synced_at?: string
          tenant_id?: string
          thread_id?: string
          to_addresses?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_events: {
        Row: {
          created_at: string
          email_account_id: string
          id: string
          matter_id: string
          message_id: string
          sent_at: string
          sent_by: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          email_account_id: string
          id?: string
          matter_id: string
          message_id: string
          sent_at?: string
          sent_by: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          email_account_id?: string
          id?: string
          matter_id?: string
          message_id?: string
          sent_at?: string
          sent_by?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_events_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_events_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_events_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string | null
          body_text: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          merge_fields: Json | null
          name: string
          subject: string | null
          tenant_id: string
          times_used: number | null
          updated_at: string | null
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          merge_fields?: Json | null
          name: string
          subject?: string | null
          tenant_id: string
          times_used?: number | null
          updated_at?: string | null
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          merge_fields?: Json | null
          name?: string
          subject?: string | null
          tenant_id?: string
          times_used?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_threads: {
        Row: {
          association_confidence: number | null
          association_method: string | null
          contact_id: string | null
          conversation_id: string
          created_at: string
          draft_locked_at: string | null
          draft_locked_by: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_sender_account_id: string | null
          matter_id: string | null
          message_count: number
          participant_emails: string[] | null
          subject: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          association_confidence?: number | null
          association_method?: string | null
          contact_id?: string | null
          conversation_id: string
          created_at?: string
          draft_locked_at?: string | null
          draft_locked_by?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string | null
          last_sender_account_id?: string | null
          matter_id?: string | null
          message_count?: number
          participant_emails?: string[] | null
          subject?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          association_confidence?: number | null
          association_method?: string | null
          contact_id?: string | null
          conversation_id?: string
          created_at?: string
          draft_locked_at?: string | null
          draft_locked_by?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string | null
          last_sender_account_id?: string | null
          matter_id?: string | null
          message_count?: number
          participant_emails?: string[] | null
          subject?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_draft_locked_by_fkey"
            columns: ["draft_locked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_last_sender_account_id_fkey"
            columns: ["last_sender_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_tags: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          tag_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          tag_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          tag_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expiry_reminder_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          reminder_offset_days: number
          reminder_type: string
          template_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          reminder_offset_days: number
          reminder_type: string
          template_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          reminder_offset_days?: number
          reminder_type?: string
          template_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expiry_reminder_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_document_fields: {
        Row: {
          confidence_score: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          document_id: string
          extracted_value: string
          field_key: string
          id: string
          mapped_to_canonical_key: string | null
          tenant_id: string
        }
        Insert: {
          confidence_score?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          document_id: string
          extracted_value: string
          field_key: string
          id?: string
          mapped_to_canonical_key?: string | null
          tenant_id: string
        }
        Update: {
          confidence_score?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          document_id?: string
          extracted_value?: string
          field_key?: string
          id?: string
          mapped_to_canonical_key?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracted_document_fields_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_document_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      field_verifications: {
        Row: {
          id: string
          matter_id: string
          notes: string | null
          profile_path: string
          tenant_id: string
          verified_at: string
          verified_by: string
          verified_value: Json | null
        }
        Insert: {
          id?: string
          matter_id: string
          notes?: string | null
          profile_path: string
          tenant_id: string
          verified_at?: string
          verified_by: string
          verified_value?: Json | null
        }
        Update: {
          id?: string
          matter_id?: string
          notes?: string | null
          profile_path?: string
          tenant_id?: string
          verified_at?: string
          verified_by?: string
          verified_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "field_verifications_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_verifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_verifications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      form_pack_artifacts: {
        Row: {
          checksum_sha256: string
          created_at: string
          file_name: string
          file_size: number | null
          form_code: string
          id: string
          is_final: boolean
          pack_version_id: string
          storage_path: string
          tenant_id: string
        }
        Insert: {
          checksum_sha256: string
          created_at?: string
          file_name: string
          file_size?: number | null
          form_code: string
          id?: string
          is_final?: boolean
          pack_version_id: string
          storage_path: string
          tenant_id: string
        }
        Update: {
          checksum_sha256?: string
          created_at?: string
          file_name?: string
          file_size?: number | null
          form_code?: string
          id?: string
          is_final?: boolean
          pack_version_id?: string
          storage_path?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_pack_artifacts_pack_version_id_fkey"
            columns: ["pack_version_id"]
            isOneToOne: false
            referencedRelation: "form_pack_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_pack_artifacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      form_pack_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          form_id: string | null
          generated_by: string | null
          generation_source: string | null
          id: string
          idempotency_key: string | null
          input_snapshot: Json
          mapping_version: string
          matter_id: string
          pack_type: string
          resolved_fields: Json
          status: string
          template_checksum: string
          tenant_id: string
          validation_result: Json | null
          version_number: number
          is_stale: boolean
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          form_id?: string | null
          generated_by?: string | null
          generation_source?: string | null
          id?: string
          idempotency_key?: string | null
          input_snapshot: Json
          mapping_version: string
          matter_id: string
          pack_type: string
          resolved_fields: Json
          status?: string
          template_checksum: string
          tenant_id: string
          validation_result?: Json | null
          version_number?: number
          is_stale?: boolean
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          form_id?: string | null
          generated_by?: string | null
          generation_source?: string | null
          id?: string
          idempotency_key?: string | null
          input_snapshot?: Json
          mapping_version?: string
          matter_id?: string
          pack_type?: string
          resolved_fields?: Json
          status?: string
          template_checksum?: string
          tenant_id?: string
          validation_result?: Json | null
          version_number?: number
          is_stale?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "form_pack_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_pack_versions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "ircc_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_pack_versions_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_pack_versions_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_pack_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          contact_id: string | null
          created_at: string | null
          data: Json
          form_id: string
          id: string
          ip_address: unknown
          lead_id: string | null
          referrer_url: string | null
          status: string | null
          tenant_id: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          data?: Json
          form_id: string
          id?: string
          ip_address?: unknown
          lead_id?: string | null
          referrer_url?: string | null
          status?: string | null
          tenant_id: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          data?: Json
          form_id?: string
          id?: string
          ip_address?: unknown
          lead_id?: string | null
          referrer_url?: string | null
          status?: string | null
          tenant_id?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          auto_assign_to: string | null
          auto_create_contact: boolean | null
          auto_create_lead: boolean | null
          branding: Json | null
          confirmation_message: string | null
          created_at: string | null
          default_pipeline_id: string | null
          default_practice_area_id: string | null
          description: string | null
          embed_allowed_domains: string[] | null
          fields: Json
          form_type: string | null
          id: string
          is_active: boolean | null
          name: string
          notification_emails: string[] | null
          redirect_url: string | null
          slug: string
          tenant_id: string
          total_submissions: number | null
          updated_at: string | null
        }
        Insert: {
          auto_assign_to?: string | null
          auto_create_contact?: boolean | null
          auto_create_lead?: boolean | null
          branding?: Json | null
          confirmation_message?: string | null
          created_at?: string | null
          default_pipeline_id?: string | null
          default_practice_area_id?: string | null
          description?: string | null
          embed_allowed_domains?: string[] | null
          fields?: Json
          form_type?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notification_emails?: string[] | null
          redirect_url?: string | null
          slug: string
          tenant_id: string
          total_submissions?: number | null
          updated_at?: string | null
        }
        Update: {
          auto_assign_to?: string | null
          auto_create_contact?: boolean | null
          auto_create_lead?: boolean | null
          branding?: Json | null
          confirmation_message?: string | null
          created_at?: string | null
          default_pipeline_id?: string | null
          default_practice_area_id?: string | null
          description?: string | null
          embed_allowed_domains?: string[] | null
          fields?: Json
          form_type?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notification_emails?: string[] | null
          redirect_url?: string | null
          slug?: string
          tenant_id?: string
          total_submissions?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forms_auto_assign_to_fkey"
            columns: ["auto_assign_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_default_pipeline_id_fkey"
            columns: ["default_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_default_practice_area_id_fkey"
            columns: ["default_practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      immigration_case_types: {
        Row: {
          created_at: string
          default_billing_type: string
          default_estimated_value: number | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_billing_type?: string
          default_estimated_value?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_billing_type?: string
          default_estimated_value?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "immigration_case_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          column_mapping: Json
          completed_at: string | null
          connection_id: string | null
          created_at: string
          created_by: string | null
          duplicate_strategy: string
          entity_type: string
          failed_rows: number
          file_name: string
          file_size_bytes: number | null
          id: string
          import_errors: Json
          import_mode: string
          processed_rows: number
          rolled_back_at: string | null
          rolled_back_by: string | null
          skipped_rows: number
          source_platform: string
          started_at: string | null
          status: string
          storage_path: string | null
          succeeded_rows: number
          tenant_id: string
          total_rows: number
          updated_at: string
          validation_errors: Json
        }
        Insert: {
          column_mapping?: Json
          completed_at?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          duplicate_strategy?: string
          entity_type: string
          failed_rows?: number
          file_name: string
          file_size_bytes?: number | null
          id?: string
          import_errors?: Json
          import_mode?: string
          processed_rows?: number
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          skipped_rows?: number
          source_platform: string
          started_at?: string | null
          status?: string
          storage_path?: string | null
          succeeded_rows?: number
          tenant_id: string
          total_rows?: number
          updated_at?: string
          validation_errors?: Json
        }
        Update: {
          column_mapping?: Json
          completed_at?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          duplicate_strategy?: string
          entity_type?: string
          failed_rows?: number
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          import_errors?: Json
          import_mode?: string
          processed_rows?: number
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          skipped_rows?: number
          source_platform?: string
          started_at?: string | null
          status?: string
          storage_path?: string | null
          succeeded_rows?: number
          tenant_id?: string
          total_rows?: number
          updated_at?: string
          validation_errors?: Json
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "platform_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_rolled_back_by_fkey"
            columns: ["rolled_back_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_id_map: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          source_entity_type: string
          source_id: string
          source_platform: string
          target_entity_type: string
          target_id: string
          tenant_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          source_entity_type: string
          source_id: string
          source_platform: string
          target_entity_type: string
          target_id: string
          tenant_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          source_entity_type?: string
          source_id?: string
          source_platform?: string
          target_entity_type?: string
          target_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_id_map_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_id_map_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_records: {
        Row: {
          batch_id: string
          created_at: string
          error_details: Json | null
          error_message: string | null
          id: string
          row_number: number
          source_data: Json
          source_id: string | null
          status: string
          target_entity_id: string | null
          target_entity_type: string
          tenant_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          error_details?: Json | null
          error_message?: string | null
          id?: string
          row_number: number
          source_data?: Json
          source_id?: string | null
          status?: string
          target_entity_id?: string | null
          target_entity_type: string
          tenant_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          error_details?: Json | null
          error_message?: string | null
          id?: string
          row_number?: number
          source_data?: Json
          source_id?: string | null
          status?: string
          target_entity_id?: string | null
          target_entity_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_records_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_forms: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          fields: Json
          id: string
          is_active: boolean
          name: string
          pipeline_id: string | null
          practice_area_id: string | null
          settings: Json
          slug: string
          stage_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          name: string
          pipeline_id?: string | null
          practice_area_id?: string | null
          settings?: Json
          slug: string
          stage_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          name?: string
          pipeline_id?: string | null
          practice_area_id?: string | null
          settings?: Json
          slug?: string
          stage_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_forms_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_forms_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_forms_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_forms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_submissions: {
        Row: {
          contact_id: string | null
          created_at: string
          data: Json
          form_id: string
          id: string
          lead_id: string | null
          processed_at: string | null
          source_ip: string | null
          status: string
          tenant_id: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          data?: Json
          form_id: string
          id?: string
          lead_id?: string | null
          processed_at?: string | null
          source_ip?: string | null
          status?: string
          tenant_id: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          data?: Json
          form_id?: string
          id?: string
          lead_id?: string | null
          processed_at?: string | null
          source_ip?: string | null
          status?: string
          tenant_id?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "intake_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token: string | null
          config: Json | null
          created_at: string | null
          id: string
          integration_type: string
          last_error: string | null
          last_sync_at: string | null
          provider: string
          refresh_token: string | null
          status: string | null
          sync_direction: string | null
          sync_frequency: string | null
          tenant_id: string
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          config?: Json | null
          created_at?: string | null
          id?: string
          integration_type: string
          last_error?: string | null
          last_sync_at?: string | null
          provider: string
          refresh_token?: string | null
          status?: string | null
          sync_direction?: string | null
          sync_frequency?: string | null
          tenant_id: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          config?: Json | null
          created_at?: string | null
          id?: string
          integration_type?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider?: string
          refresh_token?: string | null
          status?: string | null
          sync_direction?: string | null
          sync_frequency?: string | null
          tenant_id?: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_adjustments: {
        Row: {
          adjustment_type: string
          applied_by: string
          applies_to_category: string | null
          approval_status: string
          approval_threshold_id: string | null
          approved_by: string | null
          calculated_amount_cents: number
          calculation_type: string
          created_at: string
          fixed_amount_cents: number | null
          id: string
          invoice_id: string
          is_pre_tax: boolean
          line_item_id: string | null
          matter_id: string
          percentage_value: number | null
          reason_code: string
          reason_note: string | null
          requires_approval: boolean
          scope: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          adjustment_type: string
          applied_by: string
          applies_to_category?: string | null
          approval_status?: string
          approval_threshold_id?: string | null
          approved_by?: string | null
          calculated_amount_cents?: number
          calculation_type: string
          created_at?: string
          fixed_amount_cents?: number | null
          id?: string
          invoice_id: string
          is_pre_tax?: boolean
          line_item_id?: string | null
          matter_id: string
          percentage_value?: number | null
          reason_code: string
          reason_note?: string | null
          requires_approval?: boolean
          scope: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          adjustment_type?: string
          applied_by?: string
          applies_to_category?: string | null
          approval_status?: string
          approval_threshold_id?: string | null
          approved_by?: string | null
          calculated_amount_cents?: number
          calculation_type?: string
          created_at?: string
          fixed_amount_cents?: number | null
          id?: string
          invoice_id?: string
          is_pre_tax?: boolean
          line_item_id?: string | null
          matter_id?: string
          percentage_value?: number | null
          reason_code?: string
          reason_note?: string | null
          requires_approval?: boolean
          scope?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_adjustments_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_adjustments_approval_threshold_id_fkey"
            columns: ["approval_threshold_id"]
            isOneToOne: false
            referencedRelation: "discount_approval_thresholds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_adjustments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_adjustments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_adjustments_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_adjustments_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_adjustments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_audit_log: {
        Row: {
          changed_fields: Json | null
          event_description: string
          event_type: string
          id: string
          invoice_id: string
          ip_address: string | null
          matter_id: string
          performed_at: string
          performed_by: string
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          changed_fields?: Json | null
          event_description: string
          event_type: string
          id?: string
          invoice_id: string
          ip_address?: string | null
          matter_id: string
          performed_at?: string
          performed_by: string
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          changed_fields?: Json | null
          event_description?: string
          event_type?: string
          id?: string
          invoice_id?: string
          ip_address?: string | null
          matter_id?: string
          performed_at?: string
          performed_by?: string
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_audit_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_audit_log_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_delivery_logs: {
        Row: {
          comms_message_id: string | null
          created_at: string
          delivery_method: string
          delivery_status: string
          id: string
          invoice_id: string
          message_body_snapshot: string | null
          message_subject: string | null
          recipient_email: string
          recipient_name: string | null
          sent_at: string
          sent_by: string
          tenant_id: string
          viewed_at: string | null
        }
        Insert: {
          comms_message_id?: string | null
          created_at?: string
          delivery_method?: string
          delivery_status?: string
          id?: string
          invoice_id: string
          message_body_snapshot?: string | null
          message_subject?: string | null
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string
          sent_by: string
          tenant_id: string
          viewed_at?: string | null
        }
        Update: {
          comms_message_id?: string | null
          created_at?: string
          delivery_method?: string
          delivery_status?: string
          id?: string
          invoice_id?: string
          message_body_snapshot?: string | null
          message_subject?: string | null
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string
          sent_by?: string
          tenant_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_delivery_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_delivery_logs_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_delivery_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: string | null
          date_of_service: string | null
          deleted_at: string | null
          description: string
          disbursement_category_id: string | null
          discount_amount: number
          id: string
          invoice_id: string
          is_recoverable: boolean | null
          is_taxable: boolean
          line_category: string
          line_type: string
          net_amount: number
          quantity: number | null
          receipt_document_id: string | null
          sort_order: number | null
          source_id: string | null
          source_type: string
          staff_id: string | null
          tax_amount: number
          tax_code_id: string | null
          tax_rate: number
          time_entry_id: string | null
          unit_price: number
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          date_of_service?: string | null
          deleted_at?: string | null
          description: string
          disbursement_category_id?: string | null
          discount_amount?: number
          id?: string
          invoice_id: string
          is_recoverable?: boolean | null
          is_taxable?: boolean
          line_category?: string
          line_type?: string
          net_amount?: number
          quantity?: number | null
          receipt_document_id?: string | null
          sort_order?: number | null
          source_id?: string | null
          source_type?: string
          staff_id?: string | null
          tax_amount?: number
          tax_code_id?: string | null
          tax_rate?: number
          time_entry_id?: string | null
          unit_price: number
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          date_of_service?: string | null
          deleted_at?: string | null
          description?: string
          disbursement_category_id?: string | null
          discount_amount?: number
          id?: string
          invoice_id?: string
          is_recoverable?: boolean | null
          is_taxable?: boolean
          line_category?: string
          line_type?: string
          net_amount?: number
          quantity?: number | null
          receipt_document_id?: string | null
          sort_order?: number | null
          source_id?: string | null
          source_type?: string
          staff_id?: string | null
          tax_amount?: number
          tax_code_id?: string | null
          tax_rate?: number
          time_entry_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_disbursement_category_id_fk"
            columns: ["disbursement_category_id"]
            isOneToOne: false
            referencedRelation: "disbursement_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_tax_code_id_fk"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_number_sequences: {
        Row: {
          id: string
          next_val: number
          tenant_id: string
          year: number
        }
        Insert: {
          id?: string
          next_val?: number
          tenant_id: string
          year: number
        }
        Update: {
          id?: string
          next_val?: number
          tenant_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_number_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_template_soft_cost_rates: {
        Row: {
          default_rate: number
          default_tax_code_id: string | null
          description: string
          id: string
          is_active: boolean
          sort_order: number
          template_id: string
          tenant_id: string
          unit_label: string
        }
        Insert: {
          default_rate?: number
          default_tax_code_id?: string | null
          description: string
          id?: string
          is_active?: boolean
          sort_order?: number
          template_id: string
          tenant_id: string
          unit_label: string
        }
        Update: {
          default_rate?: number
          default_tax_code_id?: string | null
          description?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          template_id?: string
          tenant_id?: string
          unit_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_template_soft_cost_rates_default_tax_code_id_fkey"
            columns: ["default_tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_template_soft_cost_rates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_template_soft_cost_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_templates: {
        Row: {
          created_at: string
          created_by: string | null
          default_tax_profile_id: string | null
          footer_html: string | null
          header_html: string | null
          id: string
          is_active: boolean
          is_default: boolean
          lawyer_signature_block: string | null
          logo_url: string | null
          matter_type_code: string | null
          name: string
          overdue_wording: string | null
          payment_instructions: string | null
          practice_area_code: string | null
          standard_notes: string | null
          template_type: string
          tenant_id: string
          trust_statement_wording: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_tax_profile_id?: string | null
          footer_html?: string | null
          header_html?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          lawyer_signature_block?: string | null
          logo_url?: string | null
          matter_type_code?: string | null
          name: string
          overdue_wording?: string | null
          payment_instructions?: string | null
          practice_area_code?: string | null
          standard_notes?: string | null
          template_type?: string
          tenant_id: string
          trust_statement_wording?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_tax_profile_id?: string | null
          footer_html?: string | null
          header_html?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          lawyer_signature_block?: string | null
          logo_url?: string | null
          matter_type_code?: string | null
          name?: string
          overdue_wording?: string | null
          payment_instructions?: string | null
          practice_area_code?: string | null
          standard_notes?: string | null
          template_type?: string
          tenant_id?: string
          trust_statement_wording?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_templates_default_tax_profile_id_fkey"
            columns: ["default_tax_profile_id"]
            isOneToOne: false
            referencedRelation: "tax_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_trust_allocations: {
        Row: {
          allocation_status: string
          amount_cents: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          invoice_id: string
          matter_id: string
          notes: string | null
          requested_at: string
          requested_by: string
          tenant_id: string
          trust_account_id: string
          trust_transaction_id: string | null
          updated_at: string
        }
        Insert: {
          allocation_status?: string
          amount_cents: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          matter_id: string
          notes?: string | null
          requested_at?: string
          requested_by: string
          tenant_id: string
          trust_account_id: string
          trust_transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          allocation_status?: string
          amount_cents?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          matter_id?: string
          notes?: string | null
          requested_at?: string
          requested_by?: string
          tenant_id?: string
          trust_account_id?: string
          trust_transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_trust_allocations_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_trust_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_trust_allocations_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_trust_allocations_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_trust_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_trust_allocations_trust_account_id_fkey"
            columns: ["trust_account_id"]
            isOneToOne: false
            referencedRelation: "trust_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_trust_allocations_trust_transaction_id_fkey"
            columns: ["trust_transaction_id"]
            isOneToOne: false
            referencedRelation: "trust_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          account_type: string | null
          aging_bucket: string | null
          aging_updated_at: string | null
          amount_paid: number | null
          balance_due: number | null
          billing_period_end: string | null
          billing_period_start: string | null
          contact_id: string
          created_at: string | null
          created_by: string | null
          currency_code: string
          discount_amount: number | null
          due_date: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          internal_memo: string | null
          internal_notes: string | null
          invoice_number: string | null
          issue_date: string | null
          last_reminder_at: string | null
          matter_id: string | null
          notes: string | null
          paid_date: string | null
          payment_link_expires: string | null
          payment_link_url: string | null
          receipt_sent_at: string | null
          reminder_count: number | null
          required_before_work: boolean | null
          sent_at: string | null
          sent_to_email: string | null
          status: string | null
          subtotal: number
          subtotal_disbursements: number
          subtotal_fees: number
          subtotal_hard_costs: number
          subtotal_soft_costs: number
          tax_amount: number | null
          tax_profile_id: string | null
          tax_rate: number | null
          taxable_subtotal: number
          template_id: string | null
          tenant_id: string
          total_adjustments: number
          total_amount: number
          total_payments_applied: number
          total_trust_applied: number
          updated_at: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          account_type?: string | null
          aging_bucket?: string | null
          aging_updated_at?: string | null
          amount_paid?: number | null
          balance_due?: number | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          contact_id: string
          created_at?: string | null
          created_by?: string | null
          currency_code?: string
          discount_amount?: number | null
          due_date?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          internal_memo?: string | null
          internal_notes?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          last_reminder_at?: string | null
          matter_id?: string | null
          notes?: string | null
          paid_date?: string | null
          payment_link_expires?: string | null
          payment_link_url?: string | null
          receipt_sent_at?: string | null
          reminder_count?: number | null
          required_before_work?: boolean | null
          sent_at?: string | null
          sent_to_email?: string | null
          status?: string | null
          subtotal?: number
          subtotal_disbursements?: number
          subtotal_fees?: number
          subtotal_hard_costs?: number
          subtotal_soft_costs?: number
          tax_amount?: number | null
          tax_profile_id?: string | null
          tax_rate?: number | null
          taxable_subtotal?: number
          template_id?: string | null
          tenant_id: string
          total_adjustments?: number
          total_amount?: number
          total_payments_applied?: number
          total_trust_applied?: number
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          account_type?: string | null
          aging_bucket?: string | null
          aging_updated_at?: string | null
          amount_paid?: number | null
          balance_due?: number | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          contact_id?: string
          created_at?: string | null
          created_by?: string | null
          currency_code?: string
          discount_amount?: number | null
          due_date?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          internal_memo?: string | null
          internal_notes?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          last_reminder_at?: string | null
          matter_id?: string | null
          notes?: string | null
          paid_date?: string | null
          payment_link_expires?: string | null
          payment_link_url?: string | null
          receipt_sent_at?: string | null
          reminder_count?: number | null
          required_before_work?: boolean | null
          sent_at?: string | null
          sent_to_email?: string | null
          status?: string | null
          subtotal?: number
          subtotal_disbursements?: number
          subtotal_fees?: number
          subtotal_hard_costs?: number
          subtotal_soft_costs?: number
          tax_amount?: number | null
          tax_profile_id?: string | null
          tax_rate?: number | null
          taxable_subtotal?: number
          template_id?: string | null
          tenant_id?: string
          total_adjustments?: number
          total_amount?: number
          total_payments_applied?: number
          total_trust_applied?: number
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tax_profile_id_fk"
            columns: ["tax_profile_id"]
            isOneToOne: false
            referencedRelation: "tax_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_template_id_fk"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ircc_client_reviews: {
        Row: {
          created_at: string | null
          declined_at: string | null
          download_token: string | null
          id: string
          matter_id: string
          sent_at: string | null
          sent_by: string | null
          signed_at: string | null
          signing_request_id: string | null
          status: string
          summary_pdf_path: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          declined_at?: string | null
          download_token?: string | null
          id?: string
          matter_id: string
          sent_at?: string | null
          sent_by?: string | null
          signed_at?: string | null
          signing_request_id?: string | null
          status?: string
          summary_pdf_path?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          declined_at?: string | null
          download_token?: string | null
          id?: string
          matter_id?: string
          sent_at?: string | null
          sent_by?: string | null
          signed_at?: string | null
          signing_request_id?: string | null
          status?: string
          summary_pdf_path?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ircc_client_reviews_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_client_reviews_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_client_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ircc_form_array_maps: {
        Row: {
          created_at: string
          form_id: string
          id: string
          max_entries: number
          profile_path: string
          sub_fields: Json
          tenant_id: string
          xfa_base_path: string
          xfa_entry_name: string
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: string
          max_entries?: number
          profile_path: string
          sub_fields?: Json
          tenant_id: string
          xfa_base_path: string
          xfa_entry_name: string
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: string
          max_entries?: number
          profile_path?: string
          sub_fields?: Json
          tenant_id?: string
          xfa_base_path?: string
          xfa_entry_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ircc_form_array_maps_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "ircc_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_form_array_maps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ircc_form_fields: {
        Row: {
          array_config: Json | null
          created_at: string
          date_split: string | null
          description: string | null
          field_type: string | null
          form_id: string
          id: string
          is_array_field: boolean
          is_client_required: boolean
          is_client_visible: boolean
          is_mapped: boolean
          is_meta_field: boolean
          is_required: boolean
          label: string | null
          max_length: number | null
          meta_field_key: string | null
          options: Json | null
          page_number: number | null
          placeholder: string | null
          profile_path: string | null
          readiness_section: string | null
          required_condition: Json | null
          section_id: string | null
          show_when: Json | null
          sort_order: number
          suggested_label: string | null
          tenant_id: string
          updated_at: string
          value_format: Json | null
          xfa_field_type: string | null
          xfa_path: string
          // migration 145: forms-engine columns
          on_parent_change: string
          propagation_mode: string
          min_length: number | null
          validation_pattern: string | null
          validation_message: string | null
          is_blocking: boolean
          canonical_domain: string | null
        }
        Insert: {
          array_config?: Json | null
          created_at?: string
          date_split?: string | null
          description?: string | null
          field_type?: string | null
          form_id: string
          id?: string
          is_array_field?: boolean
          is_client_required?: boolean
          is_client_visible?: boolean
          is_mapped?: boolean
          is_meta_field?: boolean
          is_required?: boolean
          label?: string | null
          max_length?: number | null
          meta_field_key?: string | null
          options?: Json | null
          page_number?: number | null
          placeholder?: string | null
          profile_path?: string | null
          readiness_section?: string | null
          required_condition?: Json | null
          section_id?: string | null
          show_when?: Json | null
          sort_order?: number
          suggested_label?: string | null
          tenant_id: string
          updated_at?: string
          value_format?: Json | null
          xfa_field_type?: string | null
          xfa_path: string
          // migration 145: forms-engine columns
          on_parent_change?: string
          propagation_mode?: string
          min_length?: number | null
          validation_pattern?: string | null
          validation_message?: string | null
          is_blocking?: boolean
          canonical_domain?: string | null
        }
        Update: {
          array_config?: Json | null
          created_at?: string
          date_split?: string | null
          description?: string | null
          field_type?: string | null
          form_id?: string
          id?: string
          is_array_field?: boolean
          is_client_required?: boolean
          is_client_visible?: boolean
          is_mapped?: boolean
          is_meta_field?: boolean
          is_required?: boolean
          label?: string | null
          max_length?: number | null
          meta_field_key?: string | null
          options?: Json | null
          page_number?: number | null
          placeholder?: string | null
          profile_path?: string | null
          readiness_section?: string | null
          required_condition?: Json | null
          section_id?: string | null
          show_when?: Json | null
          sort_order?: number
          suggested_label?: string | null
          tenant_id?: string
          updated_at?: string
          value_format?: Json | null
          xfa_field_type?: string | null
          xfa_path?: string
          // migration 145: forms-engine columns
          on_parent_change?: string
          propagation_mode?: string
          min_length?: number | null
          validation_pattern?: string | null
          validation_message?: string | null
          is_blocking?: boolean
          canonical_domain?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ircc_form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "ircc_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_form_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "ircc_form_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_form_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ircc_form_sections: {
        Row: {
          created_at: string
          description: string | null
          form_id: string
          id: string
          merge_into: string | null
          section_key: string
          sort_order: number
          tenant_id: string
          title: string
          // migration 145: forms-engine columns
          completion_condition: Json | null
          is_repeatable: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          form_id: string
          id?: string
          merge_into?: string | null
          section_key: string
          sort_order?: number
          tenant_id: string
          title: string
          // migration 145: forms-engine columns
          completion_condition?: Json | null
          is_repeatable?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          form_id?: string
          id?: string
          merge_into?: string | null
          section_key?: string
          sort_order?: number
          tenant_id?: string
          title?: string
          // migration 145: forms-engine columns
          completion_condition?: Json | null
          is_repeatable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ircc_form_sections_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "ircc_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_form_sections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ircc_form_templates: {
        Row: {
          created_at: string
          description: string | null
          form_code: string
          form_name: string
          form_version: string
          id: string
          is_active: boolean
          pdf_template_path: string | null
          sections: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          form_code: string
          form_name: string
          form_version?: string
          id?: string
          is_active?: boolean
          pdf_template_path?: string | null
          sections?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          form_code?: string
          form_name?: string
          form_version?: string
          id?: string
          is_active?: boolean
          pdf_template_path?: string | null
          sections?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ircc_form_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ircc_form_versions: {
        Row: {
          archived_at: string
          archived_by: string | null
          checksum_sha256: string
          field_count: number
          file_name: string
          file_size: number | null
          form_date: string | null
          form_id: string
          id: string
          is_xfa: boolean
          mapped_field_count: number
          scan_result: Json | null
          storage_path: string
          tenant_id: string
          version_number: number
          xfa_root_element: string | null
        }
        Insert: {
          archived_at?: string
          archived_by?: string | null
          checksum_sha256: string
          field_count?: number
          file_name: string
          file_size?: number | null
          form_date?: string | null
          form_id: string
          id?: string
          is_xfa?: boolean
          mapped_field_count?: number
          scan_result?: Json | null
          storage_path: string
          tenant_id: string
          version_number: number
          xfa_root_element?: string | null
        }
        Update: {
          archived_at?: string
          archived_by?: string | null
          checksum_sha256?: string
          field_count?: number
          file_name?: string
          file_size?: number | null
          form_date?: string | null
          form_id?: string
          id?: string
          is_xfa?: boolean
          mapped_field_count?: number
          scan_result?: Json | null
          storage_path?: string
          tenant_id?: string
          version_number?: number
          xfa_root_element?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ircc_form_versions_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_form_versions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "ircc_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_form_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ircc_forms: {
        Row: {
          checksum_sha256: string
          created_at: string
          current_version: number
          description: string | null
          description_translations: Json | null
          file_name: string
          file_size: number | null
          form_code: string
          form_date: string | null
          form_name: string
          id: string
          is_active: boolean
          is_xfa: boolean
          mapping_version: string
          scan_error: string | null
          scan_result: Json | null
          scan_status: string
          storage_path: string
          tenant_id: string
          updated_at: string
          xfa_root_element: string | null
        }
        Insert: {
          checksum_sha256: string
          created_at?: string
          current_version?: number
          description?: string | null
          description_translations?: Json | null
          file_name: string
          file_size?: number | null
          form_code: string
          form_date?: string | null
          form_name: string
          id?: string
          is_active?: boolean
          is_xfa?: boolean
          mapping_version?: string
          scan_error?: string | null
          scan_result?: Json | null
          scan_status?: string
          storage_path: string
          tenant_id: string
          updated_at?: string
          xfa_root_element?: string | null
        }
        Update: {
          checksum_sha256?: string
          created_at?: string
          current_version?: number
          description?: string | null
          description_translations?: Json | null
          file_name?: string
          file_size?: number | null
          form_code?: string
          form_date?: string | null
          form_name?: string
          id?: string
          is_active?: boolean
          is_xfa?: boolean
          mapping_version?: string
          scan_error?: string | null
          scan_result?: Json | null
          scan_status?: string
          storage_path?: string
          tenant_id?: string
          updated_at?: string
          xfa_root_element?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ircc_forms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ircc_questionnaire_sessions: {
        Row: {
          completed_at: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          form_codes: string[]
          form_ids: string[] | null
          id: string
          matter_id: string | null
          portal_link_id: string | null
          progress: Json | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          form_codes: string[]
          form_ids?: string[] | null
          id?: string
          matter_id?: string | null
          portal_link_id?: string | null
          progress?: Json | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          form_codes?: string[]
          form_ids?: string[] | null
          id?: string
          matter_id?: string | null
          portal_link_id?: string | null
          progress?: Json | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ircc_questionnaire_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_questionnaire_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_questionnaire_sessions_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_questionnaire_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ircc_stream_forms: {
        Row: {
          case_type_id: string | null
          created_at: string
          form_id: string
          id: string
          is_required: boolean
          matter_type_id: string | null
          sort_order: number
          tenant_id: string
        }
        Insert: {
          case_type_id?: string | null
          created_at?: string
          form_id: string
          id?: string
          is_required?: boolean
          matter_type_id?: string | null
          sort_order?: number
          tenant_id: string
        }
        Update: {
          case_type_id?: string | null
          created_at?: string
          form_id?: string
          id?: string
          is_required?: boolean
          matter_type_id?: string | null
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ircc_stream_forms_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "immigration_case_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_stream_forms_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "ircc_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_stream_forms_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_stream_forms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ircc_correspondence: {
        Row: {
          id: string
          tenant_id: string
          matter_id: string
          item_type: string
          item_date: string | null
          status: string
          decision_type: string | null
          notes: string | null
          document_path: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          jr_deadline: string | null
          jr_basis: string | null
          jr_matter_id: string | null
          reapplication_matter_id: string | null
          client_notified_at: string | null
          urgent_task_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          matter_id: string
          item_type: string
          item_date?: string | null
          status?: string
          decision_type?: string | null
          notes?: string | null
          document_path?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          jr_deadline?: string | null
          jr_basis?: string | null
          jr_matter_id?: string | null
          reapplication_matter_id?: string | null
          client_notified_at?: string | null
          urgent_task_id?: string | null
        }
        Update: {
          item_type?: string
          item_date?: string | null
          status?: string
          decision_type?: string | null
          notes?: string | null
          document_path?: string | null
          updated_at?: string
          jr_deadline?: string | null
          jr_basis?: string | null
          jr_matter_id?: string | null
          reapplication_matter_id?: string | null
          client_notified_at?: string | null
          urgent_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ircc_correspondence_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ircc_correspondence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      refusal_actions: {
        Row: {
          id: string
          tenant_id: string
          correspondence_id: string
          matter_id: string
          action_type: string
          performed_at: string
          performed_by: string | null
          metadata: Json
        }
        Insert: {
          id?: string
          tenant_id: string
          correspondence_id: string
          matter_id: string
          action_type: string
          performed_at?: string
          performed_by?: string | null
          metadata?: Json
        }
        Update: {
          action_type?: string
          performed_at?: string
          performed_by?: string | null
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "refusal_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refusal_actions_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refusal_actions_correspondence_id_fkey"
            columns: ["correspondence_id"]
            isOneToOne: false
            referencedRelation: "ircc_correspondence"
            referencedColumns: ["id"]
          },
        ]
      }
      job_run_logs: {
        Row: {
          created_at: string
          id: string
          job_run_id: string
          level: string
          message: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_run_id: string
          level?: string
          message: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          job_run_id?: string
          level?: string
          message?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "job_run_logs_job_run_id_fkey"
            columns: ["job_run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          job_type: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_retries: number
          payload: Json
          priority: number
          result: Json | null
          retry_count: number
          scheduled_for: string
          started_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          job_type: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_retries?: number
          payload?: Json
          priority?: number
          result?: Json | null
          retry_count?: number
          scheduled_for?: string
          started_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          job_type?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_retries?: number
          payload?: Json
          priority?: number
          result?: Json | null
          retry_count?: number
          scheduled_for?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_ai_insights: {
        Row: {
          acceptance_notes: string | null
          accepted_at: string | null
          accepted_by: string | null
          confidence_scores: Json | null
          created_at: string
          generated_at: string
          id: string
          intake_summary: string | null
          lead_id: string
          missing_data_flags: Json | null
          model_info: string | null
          next_action_suggestion: string | null
          practice_area_suggestion: string | null
          qualification_suggestion: string | null
          tenant_id: string
          urgency_flags: Json | null
        }
        Insert: {
          acceptance_notes?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          confidence_scores?: Json | null
          created_at?: string
          generated_at?: string
          id?: string
          intake_summary?: string | null
          lead_id: string
          missing_data_flags?: Json | null
          model_info?: string | null
          next_action_suggestion?: string | null
          practice_area_suggestion?: string | null
          qualification_suggestion?: string | null
          tenant_id: string
          urgency_flags?: Json | null
        }
        Update: {
          acceptance_notes?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          confidence_scores?: Json | null
          created_at?: string
          generated_at?: string
          id?: string
          intake_summary?: string | null
          lead_id?: string
          missing_data_flags?: Json | null
          model_info?: string | null
          next_action_suggestion?: string | null
          practice_area_suggestion?: string | null
          qualification_suggestion?: string | null
          tenant_id?: string
          urgency_flags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_ai_insights_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_ai_insights_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_ai_insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_automation_settings: {
        Row: {
          created_at: string
          enabled_channels: Json | null
          id: string
          is_enabled: boolean
          practice_area_ids: Json | null
          settings_overrides: Json | null
          tenant_id: string
          trigger_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          enabled_channels?: Json | null
          id?: string
          is_enabled?: boolean
          practice_area_ids?: Json | null
          settings_overrides?: Json | null
          tenant_id: string
          trigger_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          enabled_channels?: Json | null
          id?: string
          is_enabled?: boolean
          practice_area_ids?: Json | null
          settings_overrides?: Json | null
          tenant_id?: string
          trigger_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_automation_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_automation_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_closure_records: {
        Row: {
          closed_at: string
          closed_by: string
          closed_stage: string
          created_at: string
          id: string
          lead_id: string
          reason_code: string
          reason_text: string | null
          tenant_id: string
        }
        Insert: {
          closed_at?: string
          closed_by: string
          closed_stage: string
          created_at?: string
          id?: string
          lead_id: string
          reason_code: string
          reason_text?: string | null
          tenant_id: string
        }
        Update: {
          closed_at?: string
          closed_by?: string
          closed_stage?: string
          created_at?: string
          id?: string
          lead_id?: string
          reason_code?: string
          reason_text?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_closure_records_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_closure_records_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_closure_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_communication_events: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          body_preview: string | null
          channel: string
          contact_id: string | null
          counts_as_contact_attempt: boolean
          created_at: string
          delivery_status: string | null
          direction: string
          id: string
          in_reply_to: string | null
          lead_id: string
          linked_task_id: string | null
          metadata: Json | null
          occurred_at: string
          provider_message_id: string | null
          provider_thread_id: string | null
          read_status: string | null
          subject: string | null
          subtype: string | null
          tenant_id: string
          thread_key: string | null
        }
        Insert: {
          actor_type?: string
          actor_user_id?: string | null
          body_preview?: string | null
          channel: string
          contact_id?: string | null
          counts_as_contact_attempt?: boolean
          created_at?: string
          delivery_status?: string | null
          direction: string
          id?: string
          in_reply_to?: string | null
          lead_id: string
          linked_task_id?: string | null
          metadata?: Json | null
          occurred_at?: string
          provider_message_id?: string | null
          provider_thread_id?: string | null
          read_status?: string | null
          subject?: string | null
          subtype?: string | null
          tenant_id: string
          thread_key?: string | null
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          body_preview?: string | null
          channel?: string
          contact_id?: string | null
          counts_as_contact_attempt?: boolean
          created_at?: string
          delivery_status?: string | null
          direction?: string
          id?: string
          in_reply_to?: string | null
          lead_id?: string
          linked_task_id?: string | null
          metadata?: Json | null
          occurred_at?: string
          provider_message_id?: string | null
          provider_thread_id?: string | null
          read_status?: string | null
          subject?: string | null
          subtype?: string | null
          tenant_id?: string
          thread_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_communication_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_communication_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_communication_events_in_reply_to_fkey"
            columns: ["in_reply_to"]
            isOneToOne: false
            referencedRelation: "lead_communication_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_communication_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_communication_events_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "lead_milestone_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_communication_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_consultations: {
        Row: {
          booking_appointment_id: string | null
          calendar_event_id: string | null
          conducted_by: string | null
          consultation_type: string | null
          created_at: string
          duration_minutes: number | null
          fee_amount: number | null
          fee_paid: boolean | null
          fee_paid_at: string | null
          fee_required: boolean | null
          id: string
          lead_id: string
          notes_saved: boolean | null
          outcome: string | null
          outcome_notes: string | null
          scheduled_at: string | null
          status: string
          summary_sent: boolean | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          booking_appointment_id?: string | null
          calendar_event_id?: string | null
          conducted_by?: string | null
          consultation_type?: string | null
          created_at?: string
          duration_minutes?: number | null
          fee_amount?: number | null
          fee_paid?: boolean | null
          fee_paid_at?: string | null
          fee_required?: boolean | null
          id?: string
          lead_id: string
          notes_saved?: boolean | null
          outcome?: string | null
          outcome_notes?: string | null
          scheduled_at?: string | null
          status?: string
          summary_sent?: boolean | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          booking_appointment_id?: string | null
          calendar_event_id?: string | null
          conducted_by?: string | null
          consultation_type?: string | null
          created_at?: string
          duration_minutes?: number | null
          fee_amount?: number | null
          fee_paid?: boolean | null
          fee_paid_at?: string | null
          fee_required?: boolean | null
          id?: string
          lead_id?: string
          notes_saved?: boolean | null
          outcome?: string | null
          outcome_notes?: string | null
          scheduled_at?: string | null
          status?: string
          summary_sent?: boolean | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_consultations_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_consultations_conducted_by_fkey"
            columns: ["conducted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_consultations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_consultations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_intake_profiles: {
        Row: {
          abuse_safety_flag: boolean | null
          capacity_concern_flag: boolean | null
          created_at: string
          custom_intake_data: Json | null
          id: string
          intake_summary: string | null
          jurisdiction: string | null
          lead_id: string
          limitation_risk_flag: boolean | null
          mandatory_fields_complete: boolean | null
          opposing_party_names: Json | null
          preferred_contact_method: string | null
          related_party_names: Json | null
          tenant_id: string
          updated_at: string
          urgency_level: string | null
        }
        Insert: {
          abuse_safety_flag?: boolean | null
          capacity_concern_flag?: boolean | null
          created_at?: string
          custom_intake_data?: Json | null
          id?: string
          intake_summary?: string | null
          jurisdiction?: string | null
          lead_id: string
          limitation_risk_flag?: boolean | null
          mandatory_fields_complete?: boolean | null
          opposing_party_names?: Json | null
          preferred_contact_method?: string | null
          related_party_names?: Json | null
          tenant_id: string
          updated_at?: string
          urgency_level?: string | null
        }
        Update: {
          abuse_safety_flag?: boolean | null
          capacity_concern_flag?: boolean | null
          created_at?: string
          custom_intake_data?: Json | null
          id?: string
          intake_summary?: string | null
          jurisdiction?: string | null
          lead_id?: string
          limitation_risk_flag?: boolean | null
          mandatory_fields_complete?: boolean | null
          opposing_party_names?: Json | null
          preferred_contact_method?: string | null
          related_party_names?: Json | null
          tenant_id?: string
          updated_at?: string
          urgency_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_intake_profiles_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_intake_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          subject: string | null
          tenant_id: string
          trigger_key: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          subject?: string | null
          tenant_id: string
          trigger_key: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          subject?: string | null
          tenant_id?: string
          trigger_key?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_message_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_message_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_message_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_milestone_groups: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          completion_percent: number
          completion_source: string | null
          created_at: string
          created_from_stage: string
          group_type: string
          id: string
          lead_id: string
          sort_order: number
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          completion_percent?: number
          completion_source?: string | null
          created_at?: string
          created_from_stage: string
          group_type: string
          id?: string
          lead_id: string
          sort_order?: number
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          completion_percent?: number
          completion_source?: string | null
          created_at?: string
          created_from_stage?: string
          group_type?: string
          id?: string
          lead_id?: string
          sort_order?: number
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_milestone_groups_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_milestone_groups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_milestone_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_outcomes: {
        Row: {
          id: string
          tenant_id: string
          lead_id: string
          outcome: string
          outcome_at: string
          notes: string | null
          follow_up_date: string | null
          referral_target: string | null
          duplicate_of: string | null
          actioned_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          lead_id: string
          outcome: string
          outcome_at?: string
          notes?: string | null
          follow_up_date?: string | null
          referral_target?: string | null
          duplicate_of?: string | null
          actioned_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          lead_id?: string
          outcome?: string
          outcome_at?: string
          notes?: string | null
          follow_up_date?: string | null
          referral_target?: string | null
          duplicate_of?: string | null
          actioned_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_outcomes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_outcomes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_milestone_tasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          completion_source: string | null
          created_at: string
          due_at: string | null
          id: string
          lead_id: string
          linked_communication_event_id: string | null
          linked_document_id: string | null
          linked_payment_event_id: string | null
          milestone_group_id: string
          notes: string | null
          owner_user_id: string | null
          skip_reason: string | null
          sort_order: number
          status: string
          task_type: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          completion_source?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          lead_id: string
          linked_communication_event_id?: string | null
          linked_document_id?: string | null
          linked_payment_event_id?: string | null
          milestone_group_id: string
          notes?: string | null
          owner_user_id?: string | null
          skip_reason?: string | null
          sort_order?: number
          status?: string
          task_type: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          completion_source?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          lead_id?: string
          linked_communication_event_id?: string | null
          linked_document_id?: string | null
          linked_payment_event_id?: string | null
          milestone_group_id?: string
          notes?: string | null
          owner_user_id?: string | null
          skip_reason?: string | null
          sort_order?: number
          status?: string
          task_type?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_milestone_task_comm_event"
            columns: ["linked_communication_event_id"]
            isOneToOne: false
            referencedRelation: "lead_communication_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_milestone_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_milestone_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_milestone_tasks_linked_document_id_fkey"
            columns: ["linked_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_milestone_tasks_milestone_group_id_fkey"
            columns: ["milestone_group_id"]
            isOneToOne: false
            referencedRelation: "lead_milestone_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_milestone_tasks_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_milestone_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_qualification_decisions: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          lead_id: string
          not_fit_reason_code: string | null
          notes: string | null
          requires_lawyer_review: boolean | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          lead_id: string
          not_fit_reason_code?: string | null
          notes?: string | null
          requires_lawyer_review?: boolean | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          lead_id?: string
          not_fit_reason_code?: string | null
          notes?: string | null
          requires_lawyer_review?: boolean | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_qualification_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_qualification_decisions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_qualification_decisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_reopen_records: {
        Row: {
          closure_record_id: string | null
          created_at: string
          id: string
          lead_id: string
          reopen_reason: string
          reopened_at: string
          reopened_by: string
          reopened_from_stage: string
          reopened_to_stage: string
          task_reopen_strategy: string
          tenant_id: string
        }
        Insert: {
          closure_record_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          reopen_reason: string
          reopened_at?: string
          reopened_by: string
          reopened_from_stage: string
          reopened_to_stage: string
          task_reopen_strategy?: string
          tenant_id: string
        }
        Update: {
          closure_record_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          reopen_reason?: string
          reopened_at?: string
          reopened_by?: string
          reopened_from_stage?: string
          reopened_to_stage?: string
          task_reopen_strategy?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_reopen_records_closure_record_id_fkey"
            columns: ["closure_record_id"]
            isOneToOne: false
            referencedRelation: "lead_closure_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_reopen_records_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_reopen_records_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_reopen_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_retainer_packages: {
        Row: {
          amount_requested: number | null
          billing_type: string | null
          created_at: string
          disbursements: Json | null
          government_fees: Json | null
          hst_applicable: boolean | null
          id: string
          id_verification_status: string | null
          lead_id: string
          line_items: Json | null
          matter_type_id: string | null
          notes: string | null
          payment_amount: number | null
          payment_method: string | null
          payment_plan: Json | null
          payment_received_at: string | null
          payment_status: string
          payment_terms: string | null
          person_scope: string | null
          required_documents_status: string | null
          responsible_lawyer_id: string | null
          retainer_fee_template_id: string | null
          sent_at: string | null
          signed_at: string | null
          signed_document_url: string | null
          signing_document_id: string | null
          signing_method: string | null
          signing_request_id: string | null
          status: string
          stripe_payment_intent_id: string | null
          subtotal_cents: number | null
          tax_amount_cents: number | null
          template_customized: boolean | null
          template_type: string | null
          tenant_id: string
          total_amount_cents: number | null
          updated_at: string
          verification_code: string | null
        }
        Insert: {
          amount_requested?: number | null
          billing_type?: string | null
          created_at?: string
          disbursements?: Json | null
          government_fees?: Json | null
          hst_applicable?: boolean | null
          id?: string
          id_verification_status?: string | null
          lead_id: string
          line_items?: Json | null
          matter_type_id?: string | null
          notes?: string | null
          payment_amount?: number | null
          payment_method?: string | null
          payment_plan?: Json | null
          payment_received_at?: string | null
          payment_status?: string
          payment_terms?: string | null
          person_scope?: string | null
          required_documents_status?: string | null
          responsible_lawyer_id?: string | null
          retainer_fee_template_id?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signed_document_url?: string | null
          signing_document_id?: string | null
          signing_method?: string | null
          signing_request_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal_cents?: number | null
          tax_amount_cents?: number | null
          template_customized?: boolean | null
          template_type?: string | null
          tenant_id: string
          total_amount_cents?: number | null
          updated_at?: string
          verification_code?: string | null
        }
        Update: {
          amount_requested?: number | null
          billing_type?: string | null
          created_at?: string
          disbursements?: Json | null
          government_fees?: Json | null
          hst_applicable?: boolean | null
          id?: string
          id_verification_status?: string | null
          lead_id?: string
          line_items?: Json | null
          matter_type_id?: string | null
          notes?: string | null
          payment_amount?: number | null
          payment_method?: string | null
          payment_plan?: Json | null
          payment_received_at?: string | null
          payment_status?: string
          payment_terms?: string | null
          person_scope?: string | null
          required_documents_status?: string | null
          responsible_lawyer_id?: string | null
          retainer_fee_template_id?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signed_document_url?: string | null
          signing_document_id?: string | null
          signing_method?: string | null
          signing_request_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal_cents?: number | null
          tax_amount_cents?: number | null
          template_customized?: boolean | null
          template_type?: string | null
          tenant_id?: string
          total_amount_cents?: number | null
          updated_at?: string
          verification_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_retainer_packages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_retainer_packages_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_retainer_packages_responsible_lawyer_id_fkey"
            columns: ["responsible_lawyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_retainer_packages_retainer_fee_template_id_fkey"
            columns: ["retainer_fee_template_id"]
            isOneToOne: false
            referencedRelation: "retainer_fee_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_retainer_packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stage_history: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          changed_at: string
          created_at: string
          from_stage: string | null
          from_stage_id: string | null
          id: string
          lead_id: string
          metadata: Json | null
          reason: string | null
          tenant_id: string
          to_stage: string
          to_stage_id: string | null
        }
        Insert: {
          actor_type?: string
          actor_user_id?: string | null
          changed_at?: string
          created_at?: string
          from_stage?: string | null
          from_stage_id?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          reason?: string | null
          tenant_id: string
          to_stage: string
          to_stage_id?: string | null
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          changed_at?: string
          created_at?: string
          from_stage?: string | null
          from_stage_id?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          reason?: string | null
          tenant_id?: string
          to_stage?: string
          to_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_history_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_workflow_executions: {
        Row: {
          actor_user_id: string | null
          executed_at: string
          execution_key: string
          execution_type: string
          id: string
          lead_id: string
          metadata: Json | null
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          executed_at?: string
          execution_key: string
          execution_type: string
          id?: string
          lead_id: string
          metadata?: Json | null
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          executed_at?: string
          execution_key?: string
          execution_type?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_workflow_executions_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_workflow_executions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_workflow_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_intake_staff_id: string | null
          assigned_to: string | null
          campaign_source: string | null
          closure_record_id: string | null
          conflict_status: string | null
          consultation_status: string | null
          contact_id: string
          converted_at: string | null
          converted_matter_id: string | null
          created_at: string | null
          created_by: string | null
          current_stage: string | null
          custom_fields: Json | null
          custom_intake_data: Json | null
          engagement_score: number | null
          estimated_value: number | null
          follow_up_count: number | null
          id: string
          intake_profile_id: string | null
          is_closed: boolean | null
          lead_metadata: Json | null
          last_automated_action_at: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          lead_source: string | null
          lost_detail: string | null
          lost_reason: string | null
          matter_type_id: string | null
          next_follow_up: string | null
          next_required_action: string | null
          next_required_action_due_at: string | null
          notes: string | null
          overdue_task_count: number | null
          payment_status: string | null
          person_scope: string | null
          pipeline_id: string
          practice_area_id: string | null
          qualification_status: string | null
          referral_source: string | null
          responsible_lawyer_id: string | null
          retainer_status: string | null
          source: string | null
          source_campaign: string | null
          source_detail: string | null
          stage_entered_at: string | null
          stage_id: string
          status: string | null
          sub_practice_area: string | null
          temperature: string | null
          tenant_id: string
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          weighted_value: number | null
          readiness_score: number | null
          readiness_breakdown: Json | null
          jurisdiction_id: string | null
          preferred_view: string
          preferred_language: string | null
          first_name_encrypted: string | null
          last_name_encrypted: string | null
          email_encrypted: string | null
          phone_encrypted: string | null
        }
        Insert: {
          assigned_intake_staff_id?: string | null
          assigned_to?: string | null
          campaign_source?: string | null
          closure_record_id?: string | null
          conflict_status?: string | null
          consultation_status?: string | null
          contact_id: string
          converted_at?: string | null
          converted_matter_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_stage?: string | null
          custom_fields?: Json | null
          custom_intake_data?: Json | null
          engagement_score?: number | null
          estimated_value?: number | null
          follow_up_count?: number | null
          id?: string
          intake_profile_id?: string | null
          is_closed?: boolean | null
          lead_metadata?: Json | null
          last_automated_action_at?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          lead_source?: string | null
          lost_detail?: string | null
          lost_reason?: string | null
          matter_type_id?: string | null
          next_follow_up?: string | null
          next_required_action?: string | null
          next_required_action_due_at?: string | null
          notes?: string | null
          overdue_task_count?: number | null
          payment_status?: string | null
          person_scope?: string | null
          pipeline_id: string
          practice_area_id?: string | null
          qualification_status?: string | null
          referral_source?: string | null
          responsible_lawyer_id?: string | null
          retainer_status?: string | null
          source?: string | null
          source_campaign?: string | null
          source_detail?: string | null
          stage_entered_at?: string | null
          stage_id: string
          status?: string | null
          sub_practice_area?: string | null
          temperature?: string | null
          tenant_id: string
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          weighted_value?: number | null
          readiness_score?: number | null
          readiness_breakdown?: Json | null
          jurisdiction_id?: string | null
          preferred_view?: string
          preferred_language?: string | null
          first_name_encrypted?: string | null
          last_name_encrypted?: string | null
          email_encrypted?: string | null
          phone_encrypted?: string | null
        }
        Update: {
          assigned_intake_staff_id?: string | null
          assigned_to?: string | null
          campaign_source?: string | null
          closure_record_id?: string | null
          conflict_status?: string | null
          consultation_status?: string | null
          contact_id?: string
          converted_at?: string | null
          converted_matter_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_stage?: string | null
          custom_fields?: Json | null
          custom_intake_data?: Json | null
          engagement_score?: number | null
          estimated_value?: number | null
          follow_up_count?: number | null
          id?: string
          intake_profile_id?: string | null
          is_closed?: boolean | null
          lead_metadata?: Json | null
          last_automated_action_at?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          lead_source?: string | null
          lost_detail?: string | null
          lost_reason?: string | null
          matter_type_id?: string | null
          next_follow_up?: string | null
          next_required_action?: string | null
          next_required_action_due_at?: string | null
          notes?: string | null
          overdue_task_count?: number | null
          payment_status?: string | null
          person_scope?: string | null
          pipeline_id?: string
          practice_area_id?: string | null
          qualification_status?: string | null
          referral_source?: string | null
          responsible_lawyer_id?: string | null
          retainer_status?: string | null
          source?: string | null
          source_campaign?: string | null
          source_detail?: string | null
          stage_entered_at?: string | null
          stage_id?: string
          status?: string | null
          sub_practice_area?: string | null
          temperature?: string | null
          tenant_id?: string
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          weighted_value?: number | null
          readiness_score?: number | null
          readiness_breakdown?: Json | null
          jurisdiction_id?: string | null
          preferred_view?: string
          preferred_language?: string | null
          first_name_encrypted?: string | null
          last_name_encrypted?: string | null
          email_encrypted?: string | null
          phone_encrypted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_leads_closure_record"
            columns: ["closure_record_id"]
            isOneToOne: false
            referencedRelation: "lead_closure_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_leads_intake_profile"
            columns: ["intake_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_intake_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_intake_staff_id_fkey"
            columns: ["assigned_intake_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_matter_id_fkey"
            columns: ["converted_matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_responsible_lawyer_id_fkey"
            columns: ["responsible_lawyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          body_html: string | null
          body_text: string | null
          campaign_type: string
          created_at: string | null
          created_by: string | null
          id: string
          list_id: string | null
          name: string
          scheduled_at: string | null
          sent_at: string | null
          sequence_steps: Json | null
          status: string | null
          subject: string | null
          tenant_id: string
          total_bounced: number | null
          total_clicked: number | null
          total_delivered: number | null
          total_opened: number | null
          total_recipients: number | null
          total_sent: number | null
          total_unsubscribed: number | null
          updated_at: string | null
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          campaign_type: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          list_id?: string | null
          name: string
          scheduled_at?: string | null
          sent_at?: string | null
          sequence_steps?: Json | null
          status?: string | null
          subject?: string | null
          tenant_id: string
          total_bounced?: number | null
          total_clicked?: number | null
          total_delivered?: number | null
          total_opened?: number | null
          total_recipients?: number | null
          total_sent?: number | null
          total_unsubscribed?: number | null
          updated_at?: string | null
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          campaign_type?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          list_id?: string | null
          name?: string
          scheduled_at?: string | null
          sent_at?: string | null
          sequence_steps?: Json | null
          status?: string | null
          subject?: string | null
          tenant_id?: string
          total_bounced?: number | null
          total_clicked?: number | null
          total_delivered?: number | null
          total_opened?: number | null
          total_recipients?: number | null
          total_sent?: number | null
          total_unsubscribed?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "marketing_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_list_members: {
        Row: {
          added_at: string | null
          contact_id: string
          id: string
          list_id: string
        }
        Insert: {
          added_at?: string | null
          contact_id: string
          id?: string
          list_id: string
        }
        Update: {
          added_at?: string | null
          contact_id?: string
          id?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_list_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "marketing_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_lists: {
        Row: {
          contact_count: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          filter_criteria: Json | null
          id: string
          list_type: string | null
          name: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          contact_count?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          filter_criteria?: Json | null
          id?: string
          list_type?: string | null
          name: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          contact_count?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          filter_criteria?: Json | null
          id?: string
          list_type?: string | null
          name?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_lists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_checklist_items: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category: string
          checklist_template_id: string | null
          created_at: string
          description: string | null
          document_id: string | null
          is_custom: boolean
          document_name: string
          id: string
          is_required: boolean
          matter_id: string
          notes: string | null
          received_at: string | null
          requested_at: string | null
          sort_order: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          checklist_template_id?: string | null
          created_at?: string
          description?: string | null
          document_id?: string | null
          document_name: string
          id?: string
          is_custom?: boolean
          is_required?: boolean
          matter_id: string
          notes?: string | null
          received_at?: string | null
          requested_at?: string | null
          sort_order?: number
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          checklist_template_id?: string | null
          created_at?: string
          description?: string | null
          document_id?: string | null
          document_name?: string
          id?: string
          is_custom?: boolean
          is_required?: boolean
          matter_id?: string
          notes?: string | null
          received_at?: string | null
          requested_at?: string | null
          sort_order?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_checklist_items_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_checklist_items_checklist_template_id_fkey"
            columns: ["checklist_template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_checklist_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_checklist_items_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_checklist_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_comments: {
        Row: {
          author_contact_id: string | null
          author_type: string
          author_user_id: string | null
          content: string
          created_at: string
          id: string
          is_active: boolean
          is_internal: boolean
          matter_id: string
          parent_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_contact_id?: string | null
          author_type: string
          author_user_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_internal?: boolean
          matter_id: string
          parent_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_contact_id?: string | null
          author_type?: string
          author_user_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_internal?: boolean
          matter_id?: string
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_comments_author_contact_id_fkey"
            columns: ["author_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_comments_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_comments_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "matter_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_contacts: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          matter_id: string
          notes: string | null
          role: string
          tenant_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          matter_id: string
          notes?: string | null
          role?: string
          tenant_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          matter_id?: string
          notes?: string | null
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_contacts_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_custom_data: {
        Row: {
          created_at: string
          data: Json
          id: string
          is_valid: boolean | null
          matter_id: string
          matter_type_id: string
          schema_version: number
          tenant_id: string
          updated_at: string
          validation_errors: Json | null
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          is_valid?: boolean | null
          matter_id: string
          matter_type_id: string
          schema_version?: number
          tenant_id: string
          updated_at?: string
          validation_errors?: Json | null
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          is_valid?: boolean | null
          matter_id?: string
          matter_type_id?: string
          schema_version?: number
          tenant_id?: string
          updated_at?: string
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "matter_custom_data_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: true
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_custom_data_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_custom_data_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_deadlines: {
        Row: {
          auto_generated: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          deadline_type: string
          deadline_type_id: string | null
          description: string | null
          due_date: string
          id: string
          matter_id: string
          priority: string
          reminder_days: number[] | null
          source_field: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          auto_generated?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deadline_type: string
          deadline_type_id?: string | null
          description?: string | null
          due_date: string
          id?: string
          matter_id: string
          priority?: string
          reminder_days?: number[] | null
          source_field?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          auto_generated?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deadline_type?: string
          deadline_type_id?: string | null
          description?: string | null
          due_date?: string
          id?: string
          matter_id?: string
          priority?: string
          reminder_days?: number[] | null
          source_field?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_deadlines_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_deadlines_deadline_type_id_fkey"
            columns: ["deadline_type_id"]
            isOneToOne: false
            referencedRelation: "deadline_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_deadlines_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_deadlines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_delegations: {
        Row: {
          access_level: string
          created_at: string | null
          delegate_user_id: string
          delegating_user_id: string
          expires_at: string | null
          id: string
          matter_id: string | null
          reason: string | null
          starts_at: string | null
          tenant_id: string
        }
        Insert: {
          access_level: string
          created_at?: string | null
          delegate_user_id: string
          delegating_user_id: string
          expires_at?: string | null
          id?: string
          matter_id?: string | null
          reason?: string | null
          starts_at?: string | null
          tenant_id: string
        }
        Update: {
          access_level?: string
          created_at?: string | null
          delegate_user_id?: string
          delegating_user_id?: string
          expires_at?: string | null
          id?: string
          matter_id?: string | null
          reason?: string | null
          starts_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_delegations_delegate_user_id_fkey"
            columns: ["delegate_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_delegations_delegating_user_id_fkey"
            columns: ["delegating_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_delegations_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_delegations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_dynamic_intake_answers: {
        Row: {
          answers: Json
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          id: string
          matter_id: string
          submitted_by_client: boolean | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          answers?: Json
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          matter_id: string
          submitted_by_client?: boolean | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          answers?: Json
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          matter_id?: string
          submitted_by_client?: boolean | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matter_dynamic_intake_answers_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_dynamic_intake_answers_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: true
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_dynamic_intake_answers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_folder_templates: {
        Row: {
          auto_assign_category: string | null
          created_at: string
          description: string | null
          description_translations: Json | null
          folder_type: string
          icon: string | null
          id: string
          is_active: boolean
          matter_type_id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_assign_category?: string | null
          created_at?: string
          description?: string | null
          description_translations?: Json | null
          folder_type?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          matter_type_id: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_assign_category?: string | null
          created_at?: string
          description?: string | null
          description_translations?: Json | null
          folder_type?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          matter_type_id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_folder_templates_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_folder_templates_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "matter_folder_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_folder_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_folders: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          matter_id: string
          name: string
          onedrive_folder_id: string | null
          parent_id: string | null
          slug: string
          sort_order: number
          template_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          matter_id: string
          name: string
          onedrive_folder_id?: string | null
          parent_id?: string | null
          slug: string
          sort_order?: number
          template_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          matter_id?: string
          name?: string
          onedrive_folder_id?: string | null
          parent_id?: string | null
          slug?: string
          sort_order?: number
          template_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_folders_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "matter_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_folders_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "matter_folder_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_folders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_immigration: {
        Row: {
          application_number: string | null
          canadian_work_experience_years: number | null
          case_type_id: string | null
          country_of_citizenship: string | null
          country_of_residence: string | null
          created_at: string
          criminal_record_details: string | null
          crs_score: number | null
          current_stage_id: string | null
          current_visa_expiry: string | null
          current_visa_status: string | null
          date_biometrics: string | null
          date_decision: string | null
          date_filed: string | null
          date_interview: string | null
          date_landing: string | null
          date_medical: string | null
          date_of_birth: string | null
          dependents_count: number | null
          eca_status: string | null
          education_credential: string | null
          employer_name: string | null
          government_fees: number | null
          has_criminal_record: boolean | null
          has_medical_issues: boolean | null
          id: string
          internal_notes: string | null
          job_offer_noc: string | null
          language_test_scores: Json | null
          language_test_type: string | null
          lmia_number: string | null
          matter_id: string
          medical_issue_details: string | null
          passport_expiry: string | null
          passport_number: string | null
          prior_refusal_details: string | null
          prior_refusals: boolean | null
          provincial_nominee_program: string | null
          retainer_amount: number | null
          retainer_signed: boolean | null
          retainer_signed_at: string | null
          spouse_included: boolean | null
          stage_entered_at: string
          stage_history: Json
          tenant_id: string
          uci_number: string | null
          updated_at: string
          work_experience_years: number | null
          program_category: string | null
          study_program: string | null
          study_level: string | null
          dli_number: string | null
          study_duration_months: number | null
          letter_of_acceptance: boolean | null
          work_permit_type: string | null
          job_title: string | null
          sponsor_name: string | null
          sponsor_relationship: string | null
          sponsor_status: string | null
          relationship_start_date: string | null
          second_language_test_type: string | null
          second_language_test_scores: Json | null
          intended_destination: string | null
          target_entry_date: string | null
          has_representative: boolean | null
          passport_number_encrypted: string | null
          date_of_birth_encrypted: string | null
          uci_number_encrypted: string | null
          prior_refusal_details_encrypted: string | null
          criminal_record_details_encrypted: string | null
          medical_issue_details_encrypted: string | null
          sponsor_name_encrypted: string | null
        }
        Insert: {
          application_number?: string | null
          canadian_work_experience_years?: number | null
          case_type_id?: string | null
          country_of_citizenship?: string | null
          country_of_residence?: string | null
          created_at?: string
          criminal_record_details?: string | null
          crs_score?: number | null
          current_stage_id?: string | null
          current_visa_expiry?: string | null
          current_visa_status?: string | null
          date_biometrics?: string | null
          date_decision?: string | null
          date_filed?: string | null
          date_interview?: string | null
          date_landing?: string | null
          date_medical?: string | null
          date_of_birth?: string | null
          dependents_count?: number | null
          eca_status?: string | null
          education_credential?: string | null
          employer_name?: string | null
          government_fees?: number | null
          has_criminal_record?: boolean | null
          has_medical_issues?: boolean | null
          id?: string
          internal_notes?: string | null
          job_offer_noc?: string | null
          language_test_scores?: Json | null
          language_test_type?: string | null
          lmia_number?: string | null
          matter_id: string
          medical_issue_details?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          prior_refusal_details?: string | null
          prior_refusals?: boolean | null
          provincial_nominee_program?: string | null
          retainer_amount?: number | null
          retainer_signed?: boolean | null
          retainer_signed_at?: string | null
          spouse_included?: boolean | null
          stage_entered_at?: string
          stage_history?: Json
          tenant_id: string
          uci_number?: string | null
          updated_at?: string
          work_experience_years?: number | null
          program_category?: string | null
          study_program?: string | null
          study_level?: string | null
          dli_number?: string | null
          study_duration_months?: number | null
          letter_of_acceptance?: boolean | null
          work_permit_type?: string | null
          job_title?: string | null
          sponsor_name?: string | null
          sponsor_relationship?: string | null
          sponsor_status?: string | null
          relationship_start_date?: string | null
          second_language_test_type?: string | null
          second_language_test_scores?: Json | null
          intended_destination?: string | null
          target_entry_date?: string | null
          has_representative?: boolean | null
          passport_number_encrypted?: string | null
          date_of_birth_encrypted?: string | null
          uci_number_encrypted?: string | null
          prior_refusal_details_encrypted?: string | null
          criminal_record_details_encrypted?: string | null
          medical_issue_details_encrypted?: string | null
          sponsor_name_encrypted?: string | null
        }
        Update: {
          application_number?: string | null
          canadian_work_experience_years?: number | null
          case_type_id?: string | null
          country_of_citizenship?: string | null
          country_of_residence?: string | null
          created_at?: string
          criminal_record_details?: string | null
          crs_score?: number | null
          current_stage_id?: string | null
          current_visa_expiry?: string | null
          current_visa_status?: string | null
          date_biometrics?: string | null
          date_decision?: string | null
          date_filed?: string | null
          date_interview?: string | null
          date_landing?: string | null
          date_medical?: string | null
          date_of_birth?: string | null
          dependents_count?: number | null
          eca_status?: string | null
          education_credential?: string | null
          employer_name?: string | null
          government_fees?: number | null
          has_criminal_record?: boolean | null
          has_medical_issues?: boolean | null
          id?: string
          internal_notes?: string | null
          job_offer_noc?: string | null
          language_test_scores?: Json | null
          language_test_type?: string | null
          lmia_number?: string | null
          matter_id?: string
          medical_issue_details?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          prior_refusal_details?: string | null
          prior_refusals?: boolean | null
          provincial_nominee_program?: string | null
          retainer_amount?: number | null
          retainer_signed?: boolean | null
          retainer_signed_at?: string | null
          spouse_included?: boolean | null
          stage_entered_at?: string
          stage_history?: Json
          tenant_id?: string
          uci_number?: string | null
          updated_at?: string
          work_experience_years?: number | null
          program_category?: string | null
          study_program?: string | null
          study_level?: string | null
          dli_number?: string | null
          study_duration_months?: number | null
          letter_of_acceptance?: boolean | null
          work_permit_type?: string | null
          job_title?: string | null
          sponsor_name?: string | null
          sponsor_relationship?: string | null
          sponsor_status?: string | null
          relationship_start_date?: string | null
          second_language_test_type?: string | null
          second_language_test_scores?: Json | null
          intended_destination?: string | null
          target_entry_date?: string | null
          has_representative?: boolean | null
          passport_number_encrypted?: string | null
          date_of_birth_encrypted?: string | null
          uci_number_encrypted?: string | null
          prior_refusal_details_encrypted?: string | null
          criminal_record_details_encrypted?: string | null
          medical_issue_details_encrypted?: string | null
          sponsor_name_encrypted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matter_immigration_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "immigration_case_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_immigration_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "case_stage_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_immigration_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: true
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_immigration_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_intake: {
        Row: {
          completion_pct: number
          created_at: string
          id: string
          imm_status_changed_at: string | null
          imm_status_changed_by: string | null
          immigration_intake_status: string
          intake_delegation: string
          intake_status: string
          jurisdiction: string
          lead_intake_snapshot: Json | null
          lock_reason: string | null
          locked_at: string | null
          locked_by: string | null
          matter_id: string
          processing_stream: string | null
          program_category: string | null
          red_flags: Json
          risk_calculated_at: string | null
          risk_level: string | null
          risk_override_at: string | null
          risk_override_by: string | null
          risk_override_level: string | null
          risk_override_reason: string | null
          risk_score: number | null
          tenant_id: string
          updated_at: string
          contradiction_flags: Json
          contradiction_override_at: string | null
          contradiction_override_by: string | null
          lawyer_review_status: string | null
          lawyer_review_by: string | null
          lawyer_review_at: string | null
          lawyer_review_notes: string | null
          eligibility_verified_at: string | null
          eligibility_verified_by: string | null
          eligibility_outcome: string | null
        }
        Insert: {
          completion_pct?: number
          created_at?: string
          id?: string
          imm_status_changed_at?: string | null
          imm_status_changed_by?: string | null
          immigration_intake_status?: string
          intake_delegation?: string
          intake_status?: string
          jurisdiction?: string
          lead_intake_snapshot?: Json | null
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          matter_id: string
          processing_stream?: string | null
          program_category?: string | null
          red_flags?: Json
          risk_calculated_at?: string | null
          risk_level?: string | null
          risk_override_at?: string | null
          risk_override_by?: string | null
          risk_override_level?: string | null
          risk_override_reason?: string | null
          risk_score?: number | null
          tenant_id: string
          updated_at?: string
          contradiction_flags?: Json
          contradiction_override_at?: string | null
          contradiction_override_by?: string | null
          lawyer_review_status?: string | null
          lawyer_review_by?: string | null
          lawyer_review_at?: string | null
          lawyer_review_notes?: string | null
          eligibility_verified_at?: string | null
          eligibility_verified_by?: string | null
          eligibility_outcome?: string | null
        }
        Update: {
          completion_pct?: number
          created_at?: string
          id?: string
          imm_status_changed_at?: string | null
          imm_status_changed_by?: string | null
          immigration_intake_status?: string
          intake_delegation?: string
          intake_status?: string
          jurisdiction?: string
          lead_intake_snapshot?: Json | null
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          matter_id?: string
          processing_stream?: string | null
          program_category?: string | null
          red_flags?: Json
          risk_calculated_at?: string | null
          risk_level?: string | null
          risk_override_at?: string | null
          risk_override_by?: string | null
          risk_override_level?: string | null
          risk_override_reason?: string | null
          risk_score?: number | null
          tenant_id?: string
          updated_at?: string
          contradiction_flags?: Json
          contradiction_override_at?: string | null
          contradiction_override_by?: string | null
          lawyer_review_status?: string | null
          lawyer_review_by?: string | null
          lawyer_review_at?: string | null
          lawyer_review_notes?: string | null
          eligibility_verified_at?: string | null
          eligibility_verified_by?: string | null
          eligibility_outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matter_intake_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_intake_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: true
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_intake_risk_override_by_fkey"
            columns: ["risk_override_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_intake_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_intake_risk_flags: {
        Row: {
          created_at: string | null
          field_key: string
          id: string
          intake_value: string | null
          ircc_value: string | null
          matter_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source_label: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          field_key: string
          id?: string
          intake_value?: string | null
          ircc_value?: string | null
          matter_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_label?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          field_key?: string
          id?: string
          intake_value?: string | null
          ircc_value?: string | null
          matter_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_label?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_intake_risk_flags_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_intake_risk_flags_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_intake_risk_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_onboarding_steps: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          id: string
          matter_id: string
          step_key: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          id?: string
          matter_id: string
          step_key: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          id?: string
          matter_id?: string
          step_key?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matter_onboarding_steps_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_onboarding_steps_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_onboarding_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_outcome_events: {
        Row: {
          created_at: string
          created_by: string
          document_id: string | null
          event_type: string
          id: string
          matter_id: string
          next_action: string | null
          next_matter_id: string | null
          outcome_data: Json
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document_id?: string | null
          event_type: string
          id?: string
          matter_id: string
          next_action?: string | null
          next_matter_id?: string | null
          outcome_data?: Json
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_id?: string | null
          event_type?: string
          id?: string
          matter_id?: string
          next_action?: string | null
          next_matter_id?: string | null
          outcome_data?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_outcome_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_outcome_events_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_outcome_events_next_matter_id_fkey"
            columns: ["next_matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_outcome_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_people: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_id: string | null
          country_of_birth: string | null
          country_of_residence: string | null
          created_at: string
          criminal_charges: boolean | null
          criminal_details: string | null
          currently_in_canada: boolean | null
          date_of_birth: string | null
          email: string | null
          employer_name: string | null
          first_name: string
          gender: string | null
          id: string
          immigration_status: string | null
          inadmissibility_details: string | null
          inadmissibility_flag: boolean | null
          is_active: boolean
          is_locked: boolean
          last_name: string
          marital_status: string | null
          matter_id: string
          middle_name: string | null
          nationality: string | null
          noc_code: string | null
          number_of_dependents: number | null
          occupation: string | null
          passport_expiry: string | null
          passport_number: string | null
          person_role: string
          phone: string | null
          postal_code: string | null
          previous_marriage: boolean | null
          profile_data: Json | null
          profile_version: number
          province_state: string | null
          relationship_to_pa: string | null
          role_label: string | null
          section_complete: boolean
          snapshot_taken_at: string | null
          sort_order: number
          status_expiry_date: string | null
          tenant_id: string
          travel_history_flag: boolean | null
          updated_at: string
          work_permit_type: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_id?: string | null
          country_of_birth?: string | null
          country_of_residence?: string | null
          created_at?: string
          criminal_charges?: boolean | null
          criminal_details?: string | null
          currently_in_canada?: boolean | null
          date_of_birth?: string | null
          email?: string | null
          employer_name?: string | null
          first_name: string
          gender?: string | null
          id?: string
          immigration_status?: string | null
          inadmissibility_details?: string | null
          inadmissibility_flag?: boolean | null
          is_active?: boolean
          is_locked?: boolean
          last_name: string
          marital_status?: string | null
          matter_id: string
          middle_name?: string | null
          nationality?: string | null
          noc_code?: string | null
          number_of_dependents?: number | null
          occupation?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          person_role?: string
          phone?: string | null
          postal_code?: string | null
          previous_marriage?: boolean | null
          profile_data?: Json | null
          profile_version?: number
          province_state?: string | null
          relationship_to_pa?: string | null
          role_label?: string | null
          section_complete?: boolean
          snapshot_taken_at?: string | null
          sort_order?: number
          status_expiry_date?: string | null
          tenant_id: string
          travel_history_flag?: boolean | null
          updated_at?: string
          work_permit_type?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_id?: string | null
          country_of_birth?: string | null
          country_of_residence?: string | null
          created_at?: string
          criminal_charges?: boolean | null
          criminal_details?: string | null
          currently_in_canada?: boolean | null
          date_of_birth?: string | null
          email?: string | null
          employer_name?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          immigration_status?: string | null
          inadmissibility_details?: string | null
          inadmissibility_flag?: boolean | null
          is_active?: boolean
          is_locked?: boolean
          last_name?: string
          marital_status?: string | null
          matter_id?: string
          middle_name?: string | null
          nationality?: string | null
          noc_code?: string | null
          number_of_dependents?: number | null
          occupation?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          person_role?: string
          phone?: string | null
          postal_code?: string | null
          previous_marriage?: boolean | null
          profile_data?: Json | null
          profile_version?: number
          province_state?: string | null
          relationship_to_pa?: string | null
          role_label?: string | null
          section_complete?: boolean
          snapshot_taken_at?: string | null
          sort_order?: number
          status_expiry_date?: string | null
          tenant_id?: string
          travel_history_flag?: boolean | null
          updated_at?: string
          work_permit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matter_people_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_people_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_people_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_profile_sync_log: {
        Row: {
          contact_id: string | null
          created_at: string
          fields_synced: string[] | null
          id: string
          matter_id: string
          matter_person_id: string
          notes: string | null
          sync_direction: string
          synced_by: string | null
          tenant_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          fields_synced?: string[] | null
          id?: string
          matter_id: string
          matter_person_id: string
          notes?: string | null
          sync_direction: string
          synced_by?: string | null
          tenant_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          fields_synced?: string[] | null
          id?: string
          matter_id?: string
          matter_person_id?: string
          notes?: string | null
          sync_direction?: string
          synced_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_mpsl_contact"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_mpsl_matter"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_mpsl_person"
            columns: ["matter_person_id"]
            isOneToOne: false
            referencedRelation: "matter_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_mpsl_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_mpsl_user"
            columns: ["synced_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_risk_flags: {
        Row: {
          auto_detected: boolean | null
          created_at: string
          detected_at: string
          detected_by: string
          evidence: Json | null
          flag_type: string
          id: string
          matter_id: string
          override_reason: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          suggested_action: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_detected?: boolean | null
          created_at?: string
          detected_at?: string
          detected_by?: string
          evidence?: Json | null
          flag_type: string
          id?: string
          matter_id: string
          override_reason?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          suggested_action?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_detected?: boolean | null
          created_at?: string
          detected_at?: string
          detected_by?: string
          evidence?: Json | null
          flag_type?: string
          id?: string
          matter_id?: string
          override_reason?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          suggested_action?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_risk_flags_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_risk_flags_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_risk_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_billing_milestones: {
        Row: {
          id: string
          tenant_id: string
          matter_id: string
          name: string
          amount_cents: number
          due_date: string | null
          status: string
          completed_at: string | null
          billed_at: string | null
          invoice_id: string | null
          sort_order: number
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          matter_id: string
          name: string
          amount_cents?: number
          due_date?: string | null
          status?: string
          completed_at?: string | null
          billed_at?: string | null
          invoice_id?: string | null
          sort_order?: number
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          amount_cents?: number
          due_date?: string | null
          status?: string
          completed_at?: string | null
          billed_at?: string | null
          invoice_id?: string | null
          sort_order?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_billing_milestones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_billing_milestones_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_stage_pipelines: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          matter_type_id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          matter_type_id: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          matter_type_id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_stage_pipelines_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_stage_pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_stage_state: {
        Row: {
          created_at: string
          current_stage_id: string
          entered_at: string
          id: string
          matter_id: string
          pipeline_id: string
          previous_stage_id: string | null
          stage_history: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_stage_id: string
          entered_at?: string
          id?: string
          matter_id: string
          pipeline_id: string
          previous_stage_id?: string | null
          stage_history?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_stage_id?: string
          entered_at?: string
          id?: string
          matter_id?: string
          pipeline_id?: string
          previous_stage_id?: string | null
          stage_history?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_stage_state_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "matter_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_stage_state_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_stage_state_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "matter_stage_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_stage_state_previous_stage_id_fkey"
            columns: ["previous_stage_id"]
            isOneToOne: false
            referencedRelation: "matter_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_stage_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_stages: {
        Row: {
          auto_close_matter: boolean
          client_label: string | null
          color: string
          completion_pct: number
          created_at: string
          description: string | null
          gating_rules: Json
          id: string
          is_terminal: boolean
          name: string
          notify_client_on_stage_change: boolean | null
          pipeline_id: string
          sla_days: number | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_close_matter?: boolean
          client_label?: string | null
          color?: string
          completion_pct?: number
          created_at?: string
          description?: string | null
          gating_rules?: Json
          id?: string
          is_terminal?: boolean
          name: string
          notify_client_on_stage_change?: boolean | null
          pipeline_id: string
          sla_days?: number | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_close_matter?: boolean
          client_label?: string | null
          color?: string
          completion_pct?: number
          created_at?: string
          description?: string | null
          gating_rules?: Json
          id?: string
          is_terminal?: boolean
          name?: string
          notify_client_on_stage_change?: boolean | null
          pipeline_id?: string
          sla_days?: number | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "matter_stage_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_type_schema: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          json_schema: Json
          matter_type_id: string
          schema_version: number
          tenant_id: string
          ui_schema: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          json_schema?: Json
          matter_type_id: string
          schema_version?: number
          tenant_id: string
          ui_schema?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          json_schema?: Json
          matter_type_id?: string
          schema_version?: number
          tenant_id?: string
          ui_schema?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_type_schema_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_type_schema_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_type_section_config: {
        Row: {
          created_at: string
          custom_fields: Json | null
          field_config: Json | null
          id: string
          is_enabled: boolean
          matter_type_id: string
          section_key: string
          section_label: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          custom_fields?: Json | null
          field_config?: Json | null
          id?: string
          is_enabled?: boolean
          matter_type_id: string
          section_key: string
          section_label: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          custom_fields?: Json | null
          field_config?: Json | null
          id?: string
          is_enabled?: boolean
          matter_type_id?: string
          section_key?: string
          section_label?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_type_section_config_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_type_section_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_types: {
        Row: {
          auto_send_document_request: boolean | null
          color: string
          created_at: string
          description: string | null
          document_naming_template: string | null
          enforcement_enabled: boolean
          has_ircc_forms: boolean
          icon: string | null
          id: string
          intake_question_schema: Json | null
          ircc_question_set_codes: string[] | null
          is_active: boolean
          matter_type_config: Json
          name: string
          portal_instructions: string | null
          practice_area_id: string
          program_category_key: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_send_document_request?: boolean | null
          color?: string
          created_at?: string
          description?: string | null
          document_naming_template?: string | null
          enforcement_enabled?: boolean
          has_ircc_forms?: boolean
          icon?: string | null
          id?: string
          intake_question_schema?: Json | null
          ircc_question_set_codes?: string[] | null
          is_active?: boolean
          matter_type_config?: Json
          name: string
          portal_instructions?: string | null
          practice_area_id: string
          program_category_key?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_send_document_request?: boolean | null
          color?: string
          created_at?: string
          description?: string | null
          document_naming_template?: string | null
          enforcement_enabled?: boolean
          has_ircc_forms?: boolean
          icon?: string | null
          id?: string
          intake_question_schema?: Json | null
          ircc_question_set_codes?: string[] | null
          is_active?: boolean
          matter_type_config?: Json
          name?: string
          portal_instructions?: string | null
          practice_area_id?: string
          program_category_key?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_types_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      matters: {
        Row: {
          billing_type: string | null
          case_type_id: string | null
          created_at: string | null
          created_by: string | null
          custom_fields: Json | null
          date_closed: string | null
          date_opened: string | null
          description: string | null
          estimated_value: number | null
          fee_template_id: string | null
          followup_lawyer_id: string | null
          hourly_rate: number | null
          id: string
          intake_status: string | null
          is_restricted: boolean | null
          is_trust_admin: boolean
          matter_number: string | null
          matter_stage_pipeline_id: string | null
          matter_type: string | null
          matter_type_id: string | null
          next_action_description: string | null
          next_action_due_at: string | null
          next_action_escalation: string | null
          next_action_type: string | null
          next_deadline: string | null
          onboarding_completed_at: string | null
          onedrive_folder_id: string | null
          originating_lawyer_id: string | null
          originating_lead_id: string | null
          person_scope: string | null
          pipeline_id: string | null
          practice_area_id: string | null
          preferred_email_account_id: string | null
          priority: string | null
          readiness_breakdown: Json | null
          readiness_focus_area: string | null
          readiness_score: number | null
          responsible_lawyer_id: string | null
          restricted_admin_override: boolean | null
          risk_level: string | null
          source: string | null
          source_detail: string | null
          stage_entered_at: string | null
          stage_id: string | null
          status: string | null
          statute_of_limitations: string | null
          team_member_ids: string[] | null
          tenant_id: string
          title: string
          total_billed: number | null
          total_paid: number | null
          trust_balance: number | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visibility: string
          weighted_value: number | null
        }
        Insert: {
          billing_type?: string | null
          case_type_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_fields?: Json | null
          date_closed?: string | null
          date_opened?: string | null
          description?: string | null
          estimated_value?: number | null
          fee_template_id?: string | null
          followup_lawyer_id?: string | null
          hourly_rate?: number | null
          id?: string
          intake_status?: string | null
          is_restricted?: boolean | null
          is_trust_admin?: boolean
          matter_number?: string | null
          matter_stage_pipeline_id?: string | null
          matter_type?: string | null
          matter_type_id?: string | null
          next_action_description?: string | null
          next_action_due_at?: string | null
          next_action_escalation?: string | null
          next_action_type?: string | null
          next_deadline?: string | null
          onboarding_completed_at?: string | null
          onedrive_folder_id?: string | null
          originating_lawyer_id?: string | null
          originating_lead_id?: string | null
          person_scope?: string | null
          pipeline_id?: string | null
          practice_area_id?: string | null
          preferred_email_account_id?: string | null
          priority?: string | null
          readiness_breakdown?: Json | null
          readiness_focus_area?: string | null
          readiness_score?: number | null
          responsible_lawyer_id?: string | null
          restricted_admin_override?: boolean | null
          risk_level?: string | null
          source?: string | null
          source_detail?: string | null
          stage_entered_at?: string | null
          stage_id?: string | null
          status?: string | null
          statute_of_limitations?: string | null
          team_member_ids?: string[] | null
          tenant_id: string
          title: string
          total_billed?: number | null
          total_paid?: number | null
          trust_balance?: number | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visibility?: string
          weighted_value?: number | null
        }
        Update: {
          billing_type?: string | null
          case_type_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_fields?: Json | null
          date_closed?: string | null
          date_opened?: string | null
          description?: string | null
          estimated_value?: number | null
          fee_template_id?: string | null
          followup_lawyer_id?: string | null
          hourly_rate?: number | null
          id?: string
          intake_status?: string | null
          is_restricted?: boolean | null
          is_trust_admin?: boolean
          matter_number?: string | null
          matter_stage_pipeline_id?: string | null
          matter_type?: string | null
          matter_type_id?: string | null
          next_action_description?: string | null
          next_action_due_at?: string | null
          next_action_escalation?: string | null
          next_action_type?: string | null
          next_deadline?: string | null
          onboarding_completed_at?: string | null
          onedrive_folder_id?: string | null
          originating_lawyer_id?: string | null
          originating_lead_id?: string | null
          person_scope?: string | null
          pipeline_id?: string | null
          practice_area_id?: string | null
          preferred_email_account_id?: string | null
          priority?: string | null
          readiness_breakdown?: Json | null
          readiness_focus_area?: string | null
          readiness_score?: number | null
          responsible_lawyer_id?: string | null
          restricted_admin_override?: boolean | null
          risk_level?: string | null
          source?: string | null
          source_detail?: string | null
          stage_entered_at?: string | null
          stage_id?: string | null
          status?: string | null
          statute_of_limitations?: string | null
          team_member_ids?: string[] | null
          tenant_id?: string
          title?: string
          total_billed?: number | null
          total_paid?: number | null
          trust_balance?: number | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visibility?: string
          weighted_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matters_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "immigration_case_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_fee_template_id_fkey"
            columns: ["fee_template_id"]
            isOneToOne: false
            referencedRelation: "retainer_fee_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_followup_lawyer_id_fkey"
            columns: ["followup_lawyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_matter_stage_pipeline_id_fkey"
            columns: ["matter_stage_pipeline_id"]
            isOneToOne: false
            referencedRelation: "matter_stage_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_originating_lawyer_id_fkey"
            columns: ["originating_lawyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_originating_lead_id_fkey"
            columns: ["originating_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_preferred_email_account_id_fkey"
            columns: ["preferred_email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_responsible_lawyer_id_fkey"
            columns: ["responsible_lawyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_outcomes: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          matter_id: string
          notes: string | null
          outcome_data: Json
          outcome_type: string
          recorded_at: string
          recorded_by: string
          tenant_id: string
          workflow_action_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          matter_id: string
          notes?: string | null
          outcome_data?: Json
          outcome_type: string
          recorded_at?: string
          recorded_by: string
          tenant_id: string
          workflow_action_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          matter_id?: string
          notes?: string | null
          outcome_data?: Json
          outcome_type?: string
          recorded_at?: string
          recorded_by?: string
          tenant_id?: string
          workflow_action_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_outcomes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_outcomes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_outcomes_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_outcomes_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_outcomes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_outcomes_workflow_action_id_fkey"
            columns: ["workflow_action_id"]
            isOneToOne: false
            referencedRelation: "workflow_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      microsoft_connections: {
        Row: {
          access_token_encrypted: string
          calendar_delta_link: string | null
          calendar_sync_enabled: boolean
          created_at: string
          error_count: number
          id: string
          is_active: boolean
          last_calendar_sync_at: string | null
          last_error: string | null
          last_error_at: string | null
          last_tasks_sync_at: string | null
          microsoft_display_name: string | null
          microsoft_email: string
          microsoft_user_id: string
          onedrive_enabled: boolean
          onedrive_root_folder_id: string | null
          refresh_token_encrypted: string
          scopes: string[]
          tasks_delta_link: string | null
          tasks_sync_enabled: boolean
          tenant_id: string
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted: string
          calendar_delta_link?: string | null
          calendar_sync_enabled?: boolean
          created_at?: string
          error_count?: number
          id?: string
          is_active?: boolean
          last_calendar_sync_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_tasks_sync_at?: string | null
          microsoft_display_name?: string | null
          microsoft_email: string
          microsoft_user_id: string
          onedrive_enabled?: boolean
          onedrive_root_folder_id?: string | null
          refresh_token_encrypted: string
          scopes?: string[]
          tasks_delta_link?: string | null
          tasks_sync_enabled?: boolean
          tenant_id: string
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string
          calendar_delta_link?: string | null
          calendar_sync_enabled?: boolean
          created_at?: string
          error_count?: number
          id?: string
          is_active?: boolean
          last_calendar_sync_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_tasks_sync_at?: string | null
          microsoft_display_name?: string | null
          microsoft_email?: string
          microsoft_user_id?: string
          onedrive_enabled?: boolean
          onedrive_root_folder_id?: string | null
          refresh_token_encrypted?: string
          scopes?: string[]
          tasks_delta_link?: string | null
          tasks_sync_enabled?: boolean
          tenant_id?: string
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "microsoft_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microsoft_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          contact_id: string | null
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          lead_id: string | null
          matter_id: string | null
          note_type: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          contact_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          lead_id?: string | null
          matter_id?: string | null
          note_type?: string
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          contact_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          lead_id?: string | null
          matter_id?: string | null
          note_type?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channels: string[] | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_pushed: boolean | null
          is_read: boolean | null
          message: string | null
          notification_type: string | null
          priority: string | null
          pushed_at: string | null
          read_at: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Insert: {
          channels?: string[] | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_pushed?: boolean | null
          is_read?: boolean | null
          message?: string | null
          notification_type?: string | null
          priority?: string | null
          pushed_at?: string | null
          read_at?: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Update: {
          channels?: string[] | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_pushed?: boolean | null
          is_read?: boolean | null
          message?: string | null
          notification_type?: string | null
          priority?: string | null
          pushed_at?: string | null
          read_at?: string | null
          tenant_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_bank_accounts: {
        Row: {
          account_name: string
          account_number_encrypted: string
          bank_name: string
          created_at: string
          currency: string
          id: string
          institution_number: string | null
          is_active: boolean
          is_default: boolean
          next_cheque_number: number
          tenant_id: string
          transit_number: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number_encrypted: string
          bank_name: string
          created_at?: string
          currency?: string
          id?: string
          institution_number?: string | null
          is_active?: boolean
          is_default?: boolean
          next_cheque_number?: number
          tenant_id: string
          transit_number?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number_encrypted?: string
          bank_name?: string
          created_at?: string
          currency?: string
          id?: string
          institution_number?: string | null
          is_active?: boolean
          is_default?: boolean
          next_cheque_number?: number
          tenant_id?: string
          transit_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operating_bank_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plan_instalments: {
        Row: {
          amount_cents: number
          created_at: string
          due_date: string
          id: string
          instalment_number: number
          invoice_id: string
          paid_at: string | null
          payment_id: string | null
          payment_plan_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          due_date: string
          id?: string
          instalment_number: number
          invoice_id: string
          paid_at?: string | null
          payment_id?: string | null
          payment_plan_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          due_date?: string
          id?: string
          instalment_number?: number
          invoice_id?: string
          paid_at?: string | null
          payment_id?: string | null
          payment_plan_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plan_instalments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plan_instalments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plan_instalments_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plan_instalments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          approved_by: string | null
          client_contact_id: string
          created_at: string
          created_by: string
          frequency: string
          id: string
          instalment_amount_cents: number
          instalments_paid: number
          instalments_total: number
          invoice_id: string
          matter_id: string | null
          next_due_date: string
          notes: string | null
          start_date: string
          status: string
          tenant_id: string
          total_amount_cents: number
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          client_contact_id: string
          created_at?: string
          created_by: string
          frequency: string
          id?: string
          instalment_amount_cents: number
          instalments_paid?: number
          instalments_total: number
          invoice_id: string
          matter_id?: string | null
          next_due_date: string
          notes?: string | null
          start_date: string
          status?: string
          tenant_id: string
          total_amount_cents: number
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          client_contact_id?: string
          created_at?: string
          created_by?: string
          frequency?: string
          id?: string
          instalment_amount_cents?: number
          instalments_paid?: number
          instalments_total?: number
          invoice_id?: string
          matter_id?: string | null
          next_due_date?: string
          notes?: string | null
          start_date?: string
          status?: string
          tenant_id?: string
          total_amount_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_client_contact_id_fkey"
            columns: ["client_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          account_type: string | null
          amount: number
          contact_id: string
          created_at: string | null
          external_payment_id: string | null
          id: string
          instalment_id: string | null
          invoice_id: string | null
          matter_id: string | null
          notes: string | null
          payment_method: string | null
          payment_provider: string | null
          payment_source: string
          receipt_url: string | null
          received_by: string | null
          refund_amount: number | null
          refund_reason: string | null
          status: string | null
          tenant_id: string
          trust_transaction_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          account_type?: string | null
          amount: number
          contact_id: string
          created_at?: string | null
          external_payment_id?: string | null
          id?: string
          instalment_id?: string | null
          invoice_id?: string | null
          matter_id?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          payment_source?: string
          receipt_url?: string | null
          received_by?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          status?: string | null
          tenant_id: string
          trust_transaction_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          account_type?: string | null
          amount?: number
          contact_id?: string
          created_at?: string | null
          external_payment_id?: string | null
          id?: string
          instalment_id?: string | null
          invoice_id?: string | null
          matter_id?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          payment_source?: string
          receipt_url?: string | null
          received_by?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          status?: string | null
          tenant_id?: string
          trust_transaction_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_instalment_id_fkey"
            columns: ["instalment_id"]
            isOneToOne: false
            referencedRelation: "payment_plan_instalments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_trust_transaction_id_fk"
            columns: ["trust_transaction_id"]
            isOneToOne: false
            referencedRelation: "trust_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          card_display_fields: Json | null
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          is_lost_stage: boolean | null
          is_win_stage: boolean | null
          name: string
          on_enter_automation_id: string | null
          pipeline_id: string
          required_fields: Json | null
          rotting_days: number | null
          sort_order: number
          tenant_id: string
          win_probability: number | null
        }
        Insert: {
          card_display_fields?: Json | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_lost_stage?: boolean | null
          is_win_stage?: boolean | null
          name: string
          on_enter_automation_id?: string | null
          pipeline_id: string
          required_fields?: Json | null
          rotting_days?: number | null
          sort_order?: number
          tenant_id: string
          win_probability?: number | null
        }
        Update: {
          card_display_fields?: Json | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_lost_stage?: boolean | null
          is_win_stage?: boolean | null
          name?: string
          on_enter_automation_id?: string | null
          pipeline_id?: string
          required_fields?: Json | null
          rotting_days?: number | null
          sort_order?: number
          tenant_id?: string
          win_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          on_enter_automation_id: string | null
          pipeline_type: string
          practice_area: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          on_enter_automation_id?: string | null
          pipeline_type?: string
          practice_area?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          on_enter_automation_id?: string | null
          pipeline_type?: string
          practice_area?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          enabled: boolean
          feature_key: string
          id: string
          limit_value: number | null
          plan_tier: string
        }
        Insert: {
          enabled?: boolean
          feature_key: string
          id?: string
          limit_value?: number | null
          plan_tier: string
        }
        Update: {
          enabled?: boolean
          feature_key?: string
          id?: string
          limit_value?: number | null
          plan_tier?: string
        }
        Relationships: []
      }
      platform_admin_audit_logs: {
        Row: {
          action: string
          admin_id: string | null
          changes: Json
          created_at: string
          id: string
          ip: string | null
          reason: string
          request_id: string | null
          target_id: string
          target_type: string
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          ip?: string | null
          reason: string
          request_id?: string | null
          target_id: string
          target_type: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          ip?: string | null
          reason?: string
          request_id?: string | null
          target_id?: string
          target_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_admin_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          email: string
          granted_at: string
          granted_by: string
          id: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          granted_at?: string
          granted_by: string
          id?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          granted_at?: string
          granted_by?: string
          id?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_connections: {
        Row: {
          access_token_encrypted: string
          connected_by: string | null
          created_at: string
          error_count: number
          id: string
          is_active: boolean
          last_error: string | null
          last_error_at: string | null
          location_id: string | null
          platform: string
          platform_user_id: string | null
          platform_user_name: string | null
          refresh_token_encrypted: string
          tenant_id: string
          token_expires_at: string
          updated_at: string
        }
        Insert: {
          access_token_encrypted: string
          connected_by?: string | null
          created_at?: string
          error_count?: number
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          location_id?: string | null
          platform: string
          platform_user_id?: string | null
          platform_user_name?: string | null
          refresh_token_encrypted: string
          tenant_id: string
          token_expires_at: string
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string
          connected_by?: string | null
          created_at?: string
          error_count?: number
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          location_id?: string | null
          platform?: string
          platform_user_id?: string | null
          platform_user_name?: string | null
          refresh_token_encrypted?: string
          tenant_id?: string
          token_expires_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_events: {
        Row: {
          contact_id: string | null
          created_at: string
          event_data: Json
          event_type: string
          id: string
          matter_id: string
          portal_link_id: string
          tenant_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          event_data?: Json
          event_type: string
          id?: string
          matter_id: string
          portal_link_id: string
          tenant_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          event_data?: Json
          event_type?: string
          id?: string
          matter_id?: string
          portal_link_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_events_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_events_portal_link_id_fkey"
            columns: ["portal_link_id"]
            isOneToOne: false
            referencedRelation: "portal_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_links: {
        Row: {
          access_count: number
          client_read_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          is_active: boolean
          last_accessed_at: string | null
          last_rate_limit_hit_at: string | null
          link_type: string
          matter_id: string | null
          metadata: Json | null
          permissions: Json | null
          rate_limit_count: number | null
          tenant_id: string
          token: string
          token_hash: string | null
          updated_at: string
        }
        Insert: {
          access_count?: number
          client_read_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          is_active?: boolean
          last_accessed_at?: string | null
          last_rate_limit_hit_at?: string | null
          link_type?: string
          matter_id?: string | null
          metadata?: Json | null
          permissions?: Json | null
          rate_limit_count?: number | null
          tenant_id: string
          token: string
          token_hash?: string | null
          updated_at?: string
        }
        Update: {
          access_count?: number
          client_read_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean
          last_accessed_at?: string | null
          last_rate_limit_hit_at?: string | null
          link_type?: string
          matter_id?: string | null
          metadata?: Json | null
          permissions?: Json | null
          rate_limit_count?: number | null
          tenant_id?: string
          token?: string
          token_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_links_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      post_submission_document_types: {
        Row: {
          communication_template_id: string | null
          created_at: string
          creates_deadline: boolean
          creates_task: boolean
          deadline_days: number | null
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          stage_change_target: string | null
          task_template_id: string | null
          tenant_id: string
          triggers_communication: boolean
        }
        Insert: {
          communication_template_id?: string | null
          created_at?: string
          creates_deadline?: boolean
          creates_task?: boolean
          deadline_days?: number | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          stage_change_target?: string | null
          task_template_id?: string | null
          tenant_id: string
          triggers_communication?: boolean
        }
        Update: {
          communication_template_id?: string | null
          created_at?: string
          creates_deadline?: boolean
          creates_task?: boolean
          deadline_days?: number | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          stage_change_target?: string | null
          task_template_id?: string | null
          tenant_id?: string
          triggers_communication?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "post_submission_document_types_task_template_id_fkey"
            columns: ["task_template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_submission_document_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_areas: {
        Row: {
          color: string | null
          created_at: string | null
          default_folder_structure: Json | null
          default_pipeline_id: string | null
          default_task_template_id: string | null
          id: string
          is_active: boolean | null
          is_enabled: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          default_folder_structure?: Json | null
          default_pipeline_id?: string | null
          default_task_template_id?: string | null
          id?: string
          is_active?: boolean | null
          is_enabled?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          default_folder_structure?: Json | null
          default_pipeline_id?: string | null
          default_task_template_id?: string | null
          id?: string
          is_active?: boolean | null
          is_enabled?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_areas_default_pipeline_id_fkey"
            columns: ["default_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_areas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_field_history: {
        Row: {
          changed_at: string
          changed_by: string
          contact_id: string
          id: string
          new_value: Json | null
          old_value: Json | null
          profile_path: string
          tenant_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          contact_id: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          profile_path: string
          tenant_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          contact_id?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          profile_path?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_field_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_field_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_sync_log: {
        Row: {
          action: string
          created_at: string
          error: string | null
          id: string
          mapping_id: string | null
          request_payload: Json | null
          response_payload: Json | null
          status: string
          tenant_id: string
        }
        Insert: {
          action: string
          created_at?: string
          error?: string | null
          id?: string
          mapping_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          status: string
          tenant_id: string
        }
        Update: {
          action?: string
          created_at?: string
          error?: string | null
          id?: string
          mapping_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbo_sync_log_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: false
            referencedRelation: "qbo_sync_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qbo_sync_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_sync_mappings: {
        Row: {
          created_at: string
          id: string
          last_synced_at: string | null
          norva_entity_id: string
          norva_entity_type: string
          qbo_entity_id: string | null
          qbo_entity_type: string
          sync_direction: string
          sync_error: string | null
          sync_status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_synced_at?: string | null
          norva_entity_id: string
          norva_entity_type: string
          qbo_entity_id?: string | null
          qbo_entity_type: string
          sync_direction?: string
          sync_error?: string | null
          sync_status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_synced_at?: string | null
          norva_entity_id?: string
          norva_entity_type?: string
          qbo_entity_id?: string | null
          qbo_entity_type?: string
          sync_direction?: string
          sync_error?: string | null
          sync_status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbo_sync_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_edit_requests: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          matter_id: string
          portal_link_id: string
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          session_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          matter_id: string
          portal_link_id: string
          reason: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          matter_id?: string
          portal_link_id?: string
          reason?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_edit_requests_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_edit_requests_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_edit_requests_portal_link_id_fkey"
            columns: ["portal_link_id"]
            isOneToOne: false
            referencedRelation: "portal_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_edit_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_edit_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ircc_questionnaire_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_edit_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      retainer_fee_templates: {
        Row: {
          billing_type: string
          created_at: string
          description: string | null
          disbursements: Json
          government_fees: Json
          hst_applicable: boolean
          id: string
          is_active: boolean
          is_default: boolean
          matter_type_id: string
          name: string
          person_scope: string
          professional_fees: Json
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_type?: string
          created_at?: string
          description?: string | null
          disbursements?: Json
          government_fees?: Json
          hst_applicable?: boolean
          id?: string
          is_active?: boolean
          is_default?: boolean
          matter_type_id: string
          name: string
          person_scope?: string
          professional_fees?: Json
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_type?: string
          created_at?: string
          description?: string | null
          disbursements?: Json
          government_fees?: Json
          hst_applicable?: boolean
          id?: string
          is_active?: boolean
          is_default?: boolean
          matter_type_id?: string
          name?: string
          person_scope?: string
          professional_fees?: Json
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retainer_fee_templates_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retainer_fee_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      retainer_presets: {
        Row: {
          amount: number
          category: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retainer_presets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_snapshots: {
        Row: {
          active_matter_count: number
          created_at: string
          id: string
          matter_count: number
          practice_area_id: string | null
          snapshot_date: string
          tenant_id: string
          total_billed_cents: number
          total_collected_cents: number
          total_outstanding_cents: number
          total_wip_cents: number
        }
        Insert: {
          active_matter_count?: number
          created_at?: string
          id?: string
          matter_count?: number
          practice_area_id?: string | null
          snapshot_date: string
          tenant_id: string
          total_billed_cents?: number
          total_collected_cents?: number
          total_outstanding_cents?: number
          total_wip_cents?: number
        }
        Update: {
          active_matter_count?: number
          created_at?: string
          id?: string
          matter_count?: number
          practice_area_id?: string | null
          snapshot_date?: string
          tenant_id?: string
          total_billed_cents?: number
          total_collected_cents?: number
          total_outstanding_cents?: number
          total_wip_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "revenue_snapshots_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_override_history: {
        Row: {
          created_at: string
          id: string
          intake_id: string
          matter_id: string
          new_level: string
          overridden_by: string
          previous_level: string | null
          reason: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          intake_id: string
          matter_id: string
          new_level: string
          overridden_by: string
          previous_level?: string | null
          reason: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          intake_id?: string
          matter_id?: string
          new_level?: string
          overridden_by?: string
          previous_level?: string | null
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_override_history_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "matter_intake"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_override_history_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_override_history_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_override_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_system: boolean | null
          name: string
          permissions: Json | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          permissions?: Json | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          permissions?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          color: string | null
          columns: Json | null
          created_at: string | null
          entity_type: string
          filters: Json | null
          group_by: string | null
          icon: string | null
          id: string
          is_default: boolean | null
          is_shared: boolean | null
          name: string
          sort_by: Json | null
          tenant_id: string
          updated_at: string | null
          user_id: string | null
          view_type: string | null
        }
        Insert: {
          color?: string | null
          columns?: Json | null
          created_at?: string | null
          entity_type: string
          filters?: Json | null
          group_by?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          is_shared?: boolean | null
          name: string
          sort_by?: Json | null
          tenant_id: string
          updated_at?: string | null
          user_id?: string | null
          view_type?: string | null
        }
        Update: {
          color?: string | null
          columns?: Json | null
          created_at?: string | null
          entity_type?: string
          filters?: Json | null
          group_by?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          is_shared?: boolean | null
          name?: string
          sort_by?: Json | null
          tenant_id?: string
          updated_at?: string | null
          user_id?: string | null
          view_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sentinel_audit_log: {
        Row: {
          id: string
          event_type: string
          severity: string
          tenant_id: string | null
          user_id: string | null
          auth_user_id: string | null
          table_name: string | null
          record_id: string | null
          ip_address: string | null
          user_agent: string | null
          request_path: string | null
          details: Json
          created_at: string
        }
        Insert: {
          id?: string
          event_type: string
          severity?: string
          tenant_id?: string | null
          user_id?: string | null
          auth_user_id?: string | null
          table_name?: string | null
          record_id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          request_path?: string | null
          details?: Json
          created_at?: string
        }
        Update: {
          // Immutable  -  no updates allowed
          id?: never
          event_type?: never
          severity?: never
        }
        Relationships: []
      }
      signing_documents: {
        Row: {
          checksum_sha256: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          document_type: string
          file_size_bytes: number
          id: string
          lead_id: string | null
          matter_id: string | null
          source_entity_id: string
          source_entity_type: string
          storage_path: string
          tenant_id: string
          title: string
        }
        Insert: {
          checksum_sha256: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          document_type: string
          file_size_bytes: number
          id?: string
          lead_id?: string | null
          matter_id?: string | null
          source_entity_id: string
          source_entity_type: string
          storage_path: string
          tenant_id: string
          title: string
        }
        Update: {
          checksum_sha256?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string
          file_size_bytes?: number
          id?: string
          lead_id?: string | null
          matter_id?: string | null
          source_entity_id?: string
          source_entity_type?: string
          storage_path?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "signing_documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_documents_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      signing_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          consent_text: string | null
          created_at: string
          email_message_id: string | null
          event_type: string
          from_status: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          signature_mode: string | null
          signed_document_hash: string | null
          signing_request_id: string
          source_document_hash: string | null
          tenant_id: string
          to_status: string | null
          typed_name: string | null
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          consent_text?: string | null
          created_at?: string
          email_message_id?: string | null
          event_type: string
          from_status?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          signature_mode?: string | null
          signed_document_hash?: string | null
          signing_request_id: string
          source_document_hash?: string | null
          tenant_id: string
          to_status?: string | null
          typed_name?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          consent_text?: string | null
          created_at?: string
          email_message_id?: string | null
          event_type?: string
          from_status?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          signature_mode?: string | null
          signed_document_hash?: string | null
          signing_request_id?: string
          source_document_hash?: string | null
          tenant_id?: string
          to_status?: string | null
          typed_name?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signing_events_signing_request_id_fkey"
            columns: ["signing_request_id"]
            isOneToOne: false
            referencedRelation: "signing_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      signing_requests: {
        Row: {
          cancelled_at: string | null
          consent_text: string | null
          created_at: string
          created_by: string | null
          decline_reason: string | null
          declined_at: string | null
          expires_at: string
          id: string
          last_reminder_at: string | null
          lead_id: string | null
          matter_id: string | null
          reminder_count: number
          sent_at: string | null
          signature_data_path: string | null
          signature_mode: string | null
          signature_typed_name: string | null
          signed_at: string | null
          signed_document_hash: string | null
          signed_document_path: string | null
          signer_contact_id: string | null
          signer_email: string
          signer_ip: string | null
          signer_name: string
          signer_user_agent: string | null
          signing_document_id: string
          status: string
          superseded_by: string | null
          tenant_id: string
          token_hash: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          cancelled_at?: string | null
          consent_text?: string | null
          created_at?: string
          created_by?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          expires_at: string
          id?: string
          last_reminder_at?: string | null
          lead_id?: string | null
          matter_id?: string | null
          reminder_count?: number
          sent_at?: string | null
          signature_data_path?: string | null
          signature_mode?: string | null
          signature_typed_name?: string | null
          signed_at?: string | null
          signed_document_hash?: string | null
          signed_document_path?: string | null
          signer_contact_id?: string | null
          signer_email: string
          signer_ip?: string | null
          signer_name: string
          signer_user_agent?: string | null
          signing_document_id: string
          status?: string
          superseded_by?: string | null
          tenant_id: string
          token_hash: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          cancelled_at?: string | null
          consent_text?: string | null
          created_at?: string
          created_by?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          expires_at?: string
          id?: string
          last_reminder_at?: string | null
          lead_id?: string | null
          matter_id?: string | null
          reminder_count?: number
          sent_at?: string | null
          signature_data_path?: string | null
          signature_mode?: string | null
          signature_typed_name?: string | null
          signed_at?: string | null
          signed_document_hash?: string | null
          signed_document_path?: string | null
          signer_contact_id?: string | null
          signer_email?: string
          signer_ip?: string | null
          signer_name?: string
          signer_user_agent?: string | null
          signing_document_id?: string
          status?: string
          superseded_by?: string | null
          tenant_id?: string
          token_hash?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signing_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_requests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_requests_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_requests_signer_contact_id_fkey"
            columns: ["signer_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_requests_signing_document_id_fkey"
            columns: ["signing_document_id"]
            isOneToOne: false
            referencedRelation: "signing_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_requests_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "signing_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_transition_log: {
        Row: {
          created_at: string
          from_stage_id: string | null
          from_stage_name: string | null
          gate_snapshot: Json
          id: string
          matter_id: string
          override_reason: string | null
          tenant_id: string
          to_stage_id: string | null
          to_stage_name: string | null
          transition_type: string
          transitioned_by: string | null
        }
        Insert: {
          created_at?: string
          from_stage_id?: string | null
          from_stage_name?: string | null
          gate_snapshot?: Json
          id?: string
          matter_id: string
          override_reason?: string | null
          tenant_id: string
          to_stage_id?: string | null
          to_stage_name?: string | null
          transition_type?: string
          transitioned_by?: string | null
        }
        Update: {
          created_at?: string
          from_stage_id?: string | null
          from_stage_name?: string | null
          gate_snapshot?: Json
          id?: string
          matter_id?: string
          override_reason?: string | null
          tenant_id?: string
          to_stage_id?: string | null
          to_stage_name?: string | null
          transition_type?: string
          transitioned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_transition_log_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "matter_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transition_log_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transition_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transition_log_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "matter_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transition_log_transitioned_by_fkey"
            columns: ["transitioned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_processed_events: {
        Row: {
          event_id: string
          event_type: string
          id: string
          processed_at: string
          tenant_id: string | null
        }
        Insert: {
          event_id: string
          event_type: string
          id?: string
          processed_at?: string
          tenant_id?: string | null
        }
        Update: {
          event_id?: string
          event_type?: string
          id?: string
          processed_at?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_interval: string
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_tier: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_tier?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_tier?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_log: {
        Row: {
          completed_at: string | null
          connection_id: string
          direction: string
          error_message: string | null
          id: string
          items_created: number
          items_deleted: number
          items_updated: number
          metadata: Json | null
          started_at: string
          status: string
          sync_type: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          connection_id: string
          direction: string
          error_message?: string | null
          id?: string
          items_created?: number
          items_deleted?: number
          items_updated?: number
          metadata?: Json | null
          started_at?: string
          status?: string
          sync_type: string
          tenant_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          connection_id?: string
          direction?: string
          error_message?: string | null
          id?: string
          items_created?: number
          items_deleted?: number
          items_updated?: number
          metadata?: Json | null
          started_at?: string
          status?: string
          sync_type?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "microsoft_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string | null
          entity_type: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          entity_type?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          entity_type?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role: string
          task_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role?: string
          task_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role?: string
          task_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_template_items: {
        Row: {
          assign_to_role: string | null
          created_at: string | null
          days_offset: number | null
          depends_on_item_id: string | null
          description: string | null
          id: string
          priority: string | null
          sort_order: number | null
          template_id: string
          title: string
        }
        Insert: {
          assign_to_role?: string | null
          created_at?: string | null
          days_offset?: number | null
          depends_on_item_id?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          sort_order?: number | null
          template_id: string
          title: string
        }
        Update: {
          assign_to_role?: string | null
          created_at?: string | null
          days_offset?: number | null
          depends_on_item_id?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          sort_order?: number | null
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_template_items_depends_on_item_id_fkey"
            columns: ["depends_on_item_id"]
            isOneToOne: false
            referencedRelation: "task_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          practice_area_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          practice_area_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          practice_area_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by: string | null
          assigned_to: string | null
          automation_id: string | null
          blocks_task_id: string | null
          category: string
          completed_at: string | null
          completed_by: string | null
          completion_note: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          created_via: string | null
          custom_checkbox: boolean | null
          deleted_at: string | null
          deleted_by: string | null
          depends_on_task_id: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          estimated_minutes: number | null
          external_id: string | null
          external_provider: string | null
          follow_up_days: number | null
          id: string
          is_billable: boolean
          is_deleted: boolean | null
          is_recurring: boolean | null
          last_synced_at: string | null
          matter_id: string | null
          notes: string | null
          parent_task_id: string | null
          priority: string | null
          recurrence_rule: Json | null
          reminder_date: string | null
          source_template_item_id: string | null
          start_date: string | null
          status: string | null
          task_type: string
          tenant_id: string
          timeline_end: string | null
          title: string
          updated_at: string | null
          visibility: string
        }
        Insert: {
          assigned_by?: string | null
          assigned_to?: string | null
          automation_id?: string | null
          blocks_task_id?: string | null
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_via?: string | null
          custom_checkbox?: boolean | null
          deleted_at?: string | null
          deleted_by?: string | null
          depends_on_task_id?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          estimated_minutes?: number | null
          external_id?: string | null
          external_provider?: string | null
          follow_up_days?: number | null
          id?: string
          is_billable?: boolean
          is_deleted?: boolean | null
          is_recurring?: boolean | null
          last_synced_at?: string | null
          matter_id?: string | null
          notes?: string | null
          parent_task_id?: string | null
          priority?: string | null
          recurrence_rule?: Json | null
          reminder_date?: string | null
          source_template_item_id?: string | null
          start_date?: string | null
          status?: string | null
          task_type?: string
          tenant_id: string
          timeline_end?: string | null
          title: string
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          assigned_by?: string | null
          assigned_to?: string | null
          automation_id?: string | null
          blocks_task_id?: string | null
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_via?: string | null
          custom_checkbox?: boolean | null
          deleted_at?: string | null
          deleted_by?: string | null
          depends_on_task_id?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          estimated_minutes?: number | null
          external_id?: string | null
          external_provider?: string | null
          follow_up_days?: number | null
          id?: string
          is_billable?: boolean
          is_deleted?: boolean | null
          is_recurring?: boolean | null
          last_synced_at?: string | null
          matter_id?: string | null
          notes?: string | null
          parent_task_id?: string | null
          priority?: string | null
          recurrence_rule?: Json | null
          reminder_date?: string | null
          source_template_item_id?: string | null
          start_date?: string | null
          status?: string | null
          task_type?: string
          tenant_id?: string
          timeline_end?: string | null
          title?: string
          updated_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_blocks_task_id_fkey"
            columns: ["blocks_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_codes: {
        Row: {
          applies_to_disbursements: boolean
          applies_to_fees: boolean
          applies_to_hard_costs: boolean
          applies_to_soft_costs: boolean
          code: string
          id: string
          is_active: boolean
          is_default_for_profile: boolean
          label: string
          rate: number
          tax_profile_id: string
          tenant_id: string
        }
        Insert: {
          applies_to_disbursements?: boolean
          applies_to_fees?: boolean
          applies_to_hard_costs?: boolean
          applies_to_soft_costs?: boolean
          code: string
          id?: string
          is_active?: boolean
          is_default_for_profile?: boolean
          label: string
          rate?: number
          tax_profile_id: string
          tenant_id: string
        }
        Update: {
          applies_to_disbursements?: boolean
          applies_to_fees?: boolean
          applies_to_hard_costs?: boolean
          applies_to_soft_costs?: boolean
          code?: string
          id?: string
          is_active?: boolean
          is_default_for_profile?: boolean
          label?: string
          rate?: number
          tax_profile_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_codes_tax_profile_id_fkey"
            columns: ["tax_profile_id"]
            isOneToOne: false
            referencedRelation: "tax_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_jurisdictions: {
        Row: {
          code: string
          country_code: string
          id: string
          is_active: boolean
          name: string
          region_code: string | null
        }
        Insert: {
          code: string
          country_code?: string
          id?: string
          is_active?: boolean
          name: string
          region_code?: string | null
        }
        Update: {
          code?: string
          country_code?: string
          id?: string
          is_active?: boolean
          name?: string
          region_code?: string | null
        }
        Relationships: []
      }
      tax_profiles: {
        Row: {
          created_at: string
          description: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          is_active: boolean
          is_default: boolean
          jurisdiction_id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          jurisdiction_id: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          jurisdiction_id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_profiles_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "tax_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_registrations: {
        Row: {
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          is_active: boolean
          jurisdiction_id: string
          registration_number: string
          registration_type: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          jurisdiction_id: string
          registration_number: string
          registration_type: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          jurisdiction_id?: string
          registration_number?: string
          registration_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_registrations_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "tax_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_registrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_document_library: {
        Row: {
          accepted_file_types: string[] | null
          category: string
          created_at: string
          description: string | null
          description_fr: string | null
          id: string
          is_active: boolean
          is_required: boolean
          jurisdiction_code: string
          max_file_size_bytes: number | null
          person_role_scope: string | null
          platform_slot_id: string | null
          slot_name: string
          slot_slug: string
          sort_order: number
          tags: string[] | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accepted_file_types?: string[] | null
          category?: string
          created_at?: string
          description?: string | null
          description_fr?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          jurisdiction_code?: string
          max_file_size_bytes?: number | null
          person_role_scope?: string | null
          platform_slot_id?: string | null
          slot_name: string
          slot_slug: string
          sort_order?: number
          tags?: string[] | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accepted_file_types?: string[] | null
          category?: string
          created_at?: string
          description?: string | null
          description_fr?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          jurisdiction_code?: string
          max_file_size_bytes?: number | null
          person_role_scope?: string | null
          platform_slot_id?: string | null
          slot_name?: string
          slot_slug?: string
          sort_order?: number
          tags?: string[] | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_document_library_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_onboarding: {
        Row: {
          id: string
          notes: string | null
          phase: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          notes?: string | null
          phase: string
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          notes?: string | null
          phase?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_onboarding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_onboarding_checklist: {
        Row: {
          completed_at: string
          completed_by: string | null
          id: string
          item_key: string
          notes: string | null
          tenant_id: string
        }
        Insert: {
          completed_at?: string
          completed_by?: string | null
          id?: string
          item_key: string
          notes?: string | null
          tenant_id: string
        }
        Update: {
          completed_at?: string
          completed_by?: string | null
          id?: string
          item_key?: string
          notes?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_onboarding_checklist_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_checklist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_onboarding_wizard: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          activation_log: Json
          answers: Json
          created_at: string
          current_step: number
          id: string
          mode: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          activation_log?: Json
          answers?: Json
          created_at?: string
          current_step?: number
          id?: string
          mode?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          activation_log?: Json
          answers?: Json
          created_at?: string
          current_step?: number
          id?: string
          mode?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_onboarding_wizard_activated_by_fkey"
            columns: ["activated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_wizard_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_setup_log: {
        Row: {
          action: string
          applied_at: string
          applied_by: string
          id: string
          result: Json | null
          starter_pack: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          applied_at?: string
          applied_by?: string
          id?: string
          result?: Json | null
          starter_pack?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          applied_at?: string
          applied_by?: string
          id?: string
          result?: Json | null
          starter_pack?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_setup_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_violation_log: {
        Row: {
          id: string
          tenant_id: string | null
          attempted_tenant_id: string | null
          user_id: string | null
          table_name: string | null
          operation: string | null
          ip_address: string | null
          occurred_at: string
          metadata: Json
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          attempted_tenant_id?: string | null
          user_id?: string | null
          table_name?: string | null
          operation?: string | null
          ip_address?: string | null
          occurred_at?: string
          metadata?: Json
        }
        Update: {
          id?: string
          tenant_id?: string | null
          attempted_tenant_id?: string | null
          user_id?: string | null
          table_name?: string | null
          operation?: string | null
          ip_address?: string | null
          occurred_at?: string
          metadata?: Json
        }
        Relationships: []
      }
      tenants: {
        Row: {
          accent_color: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          custom_domain: string | null
          custom_domain_verified: boolean | null
          date_format: string | null
          favicon_url: string | null
          feature_flags: Json | null
          home_province: string | null
          id: string
          jurisdiction_code: string
          letterhead_layout: string | null
          legal_disclaimer: string | null
          logo_url: string | null
          matter_number_include_year: boolean | null
          matter_number_padding: number | null
          matter_number_prefix: string | null
          matter_number_separator: string | null
          max_storage_gb: number | null
          max_users: number | null
          name: string
          office_fax: string | null
          office_phone: string | null
          portal_branding: Json | null
          portal_domain: string | null
          portal_domain_verified: boolean | null
          postal_code: string | null
          primary_color: string | null
          province: string | null
          secondary_color: string | null
          settings: Json | null
          signature_url: string | null
          slug: string
          status: string
          stripe_customer_id: string | null
          subscription_status: string | null
          subscription_tier: string | null
          timezone: string | null
          trial_ends_at: string | null
          brand_activated_at: string | null
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          custom_domain?: string | null
          custom_domain_verified?: boolean | null
          date_format?: string | null
          favicon_url?: string | null
          feature_flags?: Json | null
          home_province?: string | null
          id?: string
          jurisdiction_code?: string
          letterhead_layout?: string | null
          legal_disclaimer?: string | null
          logo_url?: string | null
          matter_number_include_year?: boolean | null
          matter_number_padding?: number | null
          matter_number_prefix?: string | null
          matter_number_separator?: string | null
          max_storage_gb?: number | null
          max_users?: number | null
          name: string
          office_fax?: string | null
          office_phone?: string | null
          portal_branding?: Json | null
          portal_domain?: string | null
          portal_domain_verified?: boolean | null
          postal_code?: string | null
          primary_color?: string | null
          province?: string | null
          secondary_color?: string | null
          settings?: Json | null
          signature_url?: string | null
          slug: string
          status?: string
          stripe_customer_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
          brand_activated_at?: string | null
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          custom_domain?: string | null
          custom_domain_verified?: boolean | null
          date_format?: string | null
          favicon_url?: string | null
          feature_flags?: Json | null
          home_province?: string | null
          id?: string
          jurisdiction_code?: string
          letterhead_layout?: string | null
          legal_disclaimer?: string | null
          logo_url?: string | null
          matter_number_include_year?: boolean | null
          matter_number_padding?: number | null
          matter_number_prefix?: string | null
          matter_number_separator?: string | null
          max_storage_gb?: number | null
          max_users?: number | null
          name?: string
          office_fax?: string | null
          office_phone?: string | null
          portal_branding?: Json | null
          portal_domain?: string | null
          portal_domain_verified?: boolean | null
          postal_code?: string | null
          primary_color?: string | null
          province?: string | null
          secondary_color?: string | null
          settings?: Json | null
          signature_url?: string | null
          slug?: string
          status?: string
          stripe_customer_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
          brand_activated_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          amount: number | null
          created_at: string | null
          description: string
          duration_minutes: number
          entry_date: string
          hourly_rate: number | null
          id: string
          invoice_id: string | null
          is_billable: boolean | null
          is_invoiced: boolean | null
          matter_id: string
          task_id: string | null
          tenant_id: string
          timer_started_at: string | null
          timer_stopped_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          description: string
          duration_minutes: number
          entry_date?: string
          hourly_rate?: number | null
          id?: string
          invoice_id?: string | null
          is_billable?: boolean | null
          is_invoiced?: boolean | null
          matter_id: string
          task_id?: string | null
          tenant_id: string
          timer_started_at?: string | null
          timer_stopped_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          description?: string
          duration_minutes?: number
          entry_date?: string
          hourly_rate?: number | null
          id?: string
          invoice_id?: string | null
          is_billable?: boolean | null
          is_invoiced?: boolean | null
          matter_id?: string
          task_id?: string | null
          tenant_id?: string
          timer_started_at?: string | null
          timer_stopped_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          matter_id: string | null
          metadata: Json
          tenant_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          matter_id?: string | null
          metadata?: Json
          tenant_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          matter_id?: string | null
          metadata?: Json
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trust_audit_log_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_bank_accounts: {
        Row: {
          account_name: string
          account_number_encrypted: string
          account_type: string
          admin_matter_id: string | null
          bank_name: string
          closed_date: string | null
          created_at: string
          created_by: string | null
          currency: string
          default_hold_days_cheque: number
          default_hold_days_eft: number
          id: string
          institution_number: string | null
          is_active: boolean
          jurisdiction_code: string
          matter_id: string | null
          next_cheque_number: number
          opened_date: string
          tenant_id: string
          transit_number: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number_encrypted: string
          account_type?: string
          admin_matter_id?: string | null
          bank_name: string
          closed_date?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_hold_days_cheque?: number
          default_hold_days_eft?: number
          id?: string
          institution_number?: string | null
          is_active?: boolean
          jurisdiction_code?: string
          matter_id?: string | null
          next_cheque_number?: number
          opened_date?: string
          tenant_id: string
          transit_number?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number_encrypted?: string
          account_type?: string
          admin_matter_id?: string | null
          bank_name?: string
          closed_date?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_hold_days_cheque?: number
          default_hold_days_eft?: number
          id?: string
          institution_number?: string | null
          is_active?: boolean
          jurisdiction_code?: string
          matter_id?: string | null
          next_cheque_number?: number
          opened_date?: string
          tenant_id?: string
          transit_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trust_bank_accounts_admin_matter_id_fkey"
            columns: ["admin_matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_bank_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_bank_accounts_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_bank_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_disbursement_requests: {
        Row: {
          amount_cents: number
          approved_at: string | null
          approved_by: string | null
          authorization_ref: string | null
          authorization_type: string | null
          client_description: string | null
          created_at: string
          description: string
          id: string
          invoice_id: string | null
          matter_id: string
          payee_name: string
          payment_method: string
          prepared_at: string
          prepared_by: string
          reference_number: string | null
          rejected_by: string | null
          rejection_reason: string | null
          request_type: string
          status: string
          tenant_id: string
          trust_account_id: string
          trust_transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          approved_at?: string | null
          approved_by?: string | null
          authorization_ref?: string | null
          authorization_type?: string | null
          client_description?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_id?: string | null
          matter_id: string
          payee_name: string
          payment_method: string
          prepared_at?: string
          prepared_by: string
          reference_number?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          request_type?: string
          status?: string
          tenant_id: string
          trust_account_id: string
          trust_transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          authorization_ref?: string | null
          authorization_type?: string | null
          client_description?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string | null
          matter_id?: string
          payee_name?: string
          payment_method?: string
          prepared_at?: string
          prepared_by?: string
          reference_number?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          request_type?: string
          status?: string
          tenant_id?: string
          trust_account_id?: string
          trust_transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trust_disbursement_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_disbursement_requests_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_disbursement_requests_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_disbursement_requests_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_disbursement_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_disbursement_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_disbursement_requests_trust_account_id_fkey"
            columns: ["trust_account_id"]
            isOneToOne: false
            referencedRelation: "trust_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_disbursement_requests_trust_transaction_id_fkey"
            columns: ["trust_transaction_id"]
            isOneToOne: false
            referencedRelation: "trust_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_holds: {
        Row: {
          amount_cents: number
          created_at: string
          hold_release_date: string
          hold_start_date: string
          id: string
          matter_id: string
          released_at: string | null
          status: string
          tenant_id: string
          transaction_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          hold_release_date: string
          hold_start_date?: string
          id?: string
          matter_id: string
          released_at?: string | null
          status?: string
          tenant_id: string
          transaction_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          hold_release_date?: string
          hold_start_date?: string
          id?: string
          matter_id?: string
          released_at?: string | null
          status?: string
          tenant_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trust_holds_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_holds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_holds_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "trust_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_reconciliation_items: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          id: string
          item_type: string
          reconciliation_id: string
          resolved: boolean
          resolved_at: string | null
          tenant_id: string
          transaction_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description: string
          id?: string
          item_type: string
          reconciliation_id: string
          resolved?: boolean
          resolved_at?: string | null
          tenant_id: string
          transaction_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          id?: string
          item_type?: string
          reconciliation_id?: string
          resolved?: boolean
          resolved_at?: string | null
          tenant_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trust_reconciliation_items_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "trust_reconciliations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_reconciliation_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_reconciliation_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "trust_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_reconciliations: {
        Row: {
          adjusted_bank_balance_cents: number | null
          bank_statement_balance_cents: number | null
          book_balance_cents: number | null
          client_listing_total_cents: number | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          is_balanced: boolean | null
          notes: string | null
          outstanding_cheques_cents: number | null
          outstanding_deposits_cents: number | null
          period_end: string
          period_start: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
          trust_account_id: string
          updated_at: string
        }
        Insert: {
          adjusted_bank_balance_cents?: number | null
          bank_statement_balance_cents?: number | null
          book_balance_cents?: number | null
          client_listing_total_cents?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_balanced?: boolean | null
          notes?: string | null
          outstanding_cheques_cents?: number | null
          outstanding_deposits_cents?: number | null
          period_end: string
          period_start: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id: string
          trust_account_id: string
          updated_at?: string
        }
        Update: {
          adjusted_bank_balance_cents?: number | null
          bank_statement_balance_cents?: number | null
          book_balance_cents?: number | null
          client_listing_total_cents?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_balanced?: boolean | null
          notes?: string | null
          outstanding_cheques_cents?: number | null
          outstanding_deposits_cents?: number | null
          period_end?: string
          period_start?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string
          trust_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trust_reconciliations_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_reconciliations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_reconciliations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_reconciliations_trust_account_id_fkey"
            columns: ["trust_account_id"]
            isOneToOne: false
            referencedRelation: "trust_bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_transactions: {
        Row: {
          amount_cents: number
          authorized_by: string
          client_description: string | null
          contact_id: string | null
          created_at: string
          description: string
          effective_date: string
          hold_release_date: string | null
          id: string
          invoice_id: string | null
          is_cleared: boolean
          matter_id: string
          notes: string | null
          operating_account_id: string | null
          payment_method: string | null
          recorded_by: string
          reference_number: string | null
          reversal_of_id: string | null
          running_balance_cents: number
          tenant_id: string
          transaction_type: string
          trust_account_id: string
        }
        Insert: {
          amount_cents: number
          authorized_by: string
          client_description?: string | null
          contact_id?: string | null
          created_at?: string
          description: string
          effective_date?: string
          hold_release_date?: string | null
          id?: string
          invoice_id?: string | null
          is_cleared?: boolean
          matter_id: string
          notes?: string | null
          operating_account_id?: string | null
          payment_method?: string | null
          recorded_by: string
          reference_number?: string | null
          reversal_of_id?: string | null
          running_balance_cents?: number
          tenant_id: string
          transaction_type: string
          trust_account_id: string
        }
        Update: {
          amount_cents?: number
          authorized_by?: string
          client_description?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string
          effective_date?: string
          hold_release_date?: string | null
          id?: string
          invoice_id?: string | null
          is_cleared?: boolean
          matter_id?: string
          notes?: string | null
          operating_account_id?: string | null
          payment_method?: string | null
          recorded_by?: string
          reference_number?: string | null
          reversal_of_id?: string | null
          running_balance_cents?: number
          tenant_id?: string
          transaction_type?: string
          trust_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trust_transactions_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_transactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_transactions_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_transactions_operating_account_id_fkey"
            columns: ["operating_account_id"]
            isOneToOne: false
            referencedRelation: "operating_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_transactions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_transactions_reversal_of_id_fkey"
            columns: ["reversal_of_id"]
            isOneToOne: false
            referencedRelation: "trust_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trust_transactions_trust_account_id_fkey"
            columns: ["trust_account_id"]
            isOneToOne: false
            referencedRelation: "trust_bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      unmatched_email_queue: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          suggested_contact_ids: string[] | null
          suggested_matter_ids: string[] | null
          tenant_id: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          suggested_contact_ids?: string[] | null
          suggested_matter_ids?: string[] | null
          tenant_id: string
          thread_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          suggested_contact_ids?: string[] | null
          suggested_matter_ids?: string[] | null
          tenant_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unmatched_email_queue_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmatched_email_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmatched_email_queue_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      unsubscribes: {
        Row: {
          channel: string
          contact_id: string
          id: string
          reason: string | null
          tenant_id: string
          unsubscribed_at: string | null
        }
        Insert: {
          channel: string
          contact_id: string
          id?: string
          reason?: string | null
          tenant_id: string
          unsubscribed_at?: string | null
        }
        Update: {
          channel?: string
          contact_id?: string
          id?: string
          reason?: string | null
          tenant_id?: string
          unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unsubscribes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unsubscribes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          first_name: string
          id: string
          invited_by: string | null
          last_name: string
          role_id: string
          status: string
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          first_name: string
          id?: string
          invited_by?: string | null
          last_name: string
          role_id: string
          status?: string
          tenant_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          first_name?: string
          id?: string
          invited_by?: string | null
          last_name?: string
          role_id?: string
          status?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invites_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_supervision: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          supervisee_user_id: string
          supervisor_user_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          supervisee_user_id: string
          supervisor_user_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          supervisee_user_id?: string
          supervisor_user_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_supervision_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_supervision_supervisee_user_id_fkey"
            columns: ["supervisee_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_supervision_supervisor_user_id_fkey"
            columns: ["supervisor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_supervision_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          calendar_provider: string | null
          calendar_sync_enabled: boolean | null
          cost_rate_cents: number | null
          created_at: string | null
          device_tokens: Json | null
          email: string
          first_name: string | null
          id: string
          is_active: boolean | null
          last_login_at: string | null
          last_name: string | null
          notification_prefs: Json | null
          phone: string | null
          practice_filter_preference: string | null
          rep_display_name: string | null
          rep_email: string | null
          rep_membership_number: string | null
          rep_phone: string | null
          rep_title: string | null
          role_id: string | null
          settings: Json | null
          signature_image_url: string | null
          tenant_id: string
          updated_at: string | null
          utilization_target_hours: number | null
          locale_preference: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          calendar_provider?: string | null
          calendar_sync_enabled?: boolean | null
          cost_rate_cents?: number | null
          created_at?: string | null
          device_tokens?: Json | null
          email: string
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          last_name?: string | null
          notification_prefs?: Json | null
          phone?: string | null
          practice_filter_preference?: string | null
          rep_display_name?: string | null
          rep_email?: string | null
          rep_membership_number?: string | null
          rep_phone?: string | null
          rep_title?: string | null
          role_id?: string | null
          settings?: Json | null
          signature_image_url?: string | null
          tenant_id: string
          updated_at?: string | null
          utilization_target_hours?: number | null
          locale_preference?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          calendar_provider?: string | null
          calendar_sync_enabled?: boolean | null
          cost_rate_cents?: number | null
          created_at?: string | null
          device_tokens?: Json | null
          email?: string
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          last_name?: string | null
          notification_prefs?: Json | null
          phone?: string | null
          practice_filter_preference?: string | null
          rep_display_name?: string | null
          rep_email?: string | null
          rep_membership_number?: string | null
          rep_phone?: string | null
          rep_title?: string | null
          role_id?: string | null
          settings?: Json | null
          signature_image_url?: string | null
          tenant_id?: string
          updated_at?: string | null
          utilization_target_hours?: number | null
          locale_preference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          firm_name: string
          firm_size: string
          first_name: string
          id: string
          invited_at: string | null
          last_name: string
          notes: string | null
          onboarded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          firm_name: string
          firm_size: string
          first_name: string
          id?: string
          invited_at?: string | null
          last_name: string
          notes?: string | null
          onboarded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          firm_name?: string
          firm_size?: string
          first_name?: string
          id?: string
          invited_at?: string | null
          last_name?: string
          notes?: string | null
          onboarded_at?: string | null
          status?: string
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          created_at: string | null
          events: string[]
          id: string
          is_active: boolean | null
          last_sent_at: string | null
          last_status: number | null
          secret: string | null
          tenant_id: string
          total_failed: number | null
          total_sent: number | null
          url: string
        }
        Insert: {
          created_at?: string | null
          events: string[]
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          last_status?: number | null
          secret?: string | null
          tenant_id: string
          total_failed?: number | null
          total_sent?: number | null
          url: string
        }
        Update: {
          created_at?: string | null
          events?: string[]
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          last_status?: number | null
          secret?: string | null
          tenant_id?: string
          total_failed?: number | null
          total_sent?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_actions: {
        Row: {
          action_config: Json
          action_type: string
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          idempotency_key: string | null
          new_state: Json | null
          performed_by: string | null
          previous_state: Json | null
          shift_id: string | null
          source: string
          status: string
          tenant_id: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          created_at?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          new_state?: Json | null
          performed_by?: string | null
          previous_state?: Json | null
          shift_id?: string | null
          source?: string
          status?: string
          tenant_id: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          new_state?: Json | null
          performed_by?: string | null
          previous_state?: Json | null
          shift_id?: string | null
          source?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_actions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_automations: {
        Row: {
          actions: Json
          conditions: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          name: string
          tenant_id: string
          times_triggered: number | null
          trigger_config: Json
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          actions?: Json
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name: string
          tenant_id: string
          times_triggered?: number | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          actions?: Json
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string
          tenant_id?: string
          times_triggered?: number | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_automations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_automations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template_deadlines: {
        Row: {
          created_at: string
          days_offset: number
          deadline_type_id: string
          id: string
          tenant_id: string
          title_override: string | null
          workflow_template_id: string
        }
        Insert: {
          created_at?: string
          days_offset?: number
          deadline_type_id: string
          id?: string
          tenant_id: string
          title_override?: string | null
          workflow_template_id: string
        }
        Update: {
          created_at?: string
          days_offset?: number
          deadline_type_id?: string
          id?: string
          tenant_id?: string
          title_override?: string | null
          workflow_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_deadlines_deadline_type_id_fkey"
            columns: ["deadline_type_id"]
            isOneToOne: false
            referencedRelation: "deadline_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_deadlines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_deadlines_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          checklist_template_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          matter_type_id: string
          name: string
          stage_pipeline_id: string | null
          task_template_id: string | null
          tenant_id: string
          trigger_stage_id: string | null
          updated_at: string
        }
        Insert: {
          checklist_template_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          matter_type_id: string
          name: string
          stage_pipeline_id?: string | null
          task_template_id?: string | null
          tenant_id: string
          trigger_stage_id?: string | null
          updated_at?: string
        }
        Update: {
          checklist_template_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          matter_type_id?: string
          name?: string
          stage_pipeline_id?: string | null
          task_template_id?: string | null
          tenant_id?: string
          trigger_stage_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_checklist_template_id_fkey"
            columns: ["checklist_template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_templates_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_templates_stage_pipeline_id_fkey"
            columns: ["stage_pipeline_id"]
            isOneToOne: false
            referencedRelation: "matter_stage_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_templates_task_template_id_fkey"
            columns: ["task_template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_templates_trigger_stage_id_fkey"
            columns: ["trigger_stage_id"]
            isOneToOne: false
            referencedRelation: "matter_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_workflow_config: {
        Row: {
          active_matter_conversion_gates: Json
          auto_closure_after_days: number | null
          automation_message_settings: Json | null
          consultation_fee_rules: Json
          consultation_reminder_hours: Json
          contact_attempt_cadence_days: Json
          created_at: string
          enabled_channels: Json
          final_closure_messages_mode: string
          id: string
          lawyer_approval_requirements: Json
          mandatory_tasks_by_stage: Json
          no_show_cadence_days: Json
          payment_followup_cadence_days: Json
          retainer_followup_cadence_days: Json
          stage_reopen_permissions: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active_matter_conversion_gates?: Json
          auto_closure_after_days?: number | null
          automation_message_settings?: Json | null
          consultation_fee_rules?: Json
          consultation_reminder_hours?: Json
          contact_attempt_cadence_days?: Json
          created_at?: string
          enabled_channels?: Json
          final_closure_messages_mode?: string
          id?: string
          lawyer_approval_requirements?: Json
          mandatory_tasks_by_stage?: Json
          no_show_cadence_days?: Json
          payment_followup_cadence_days?: Json
          retainer_followup_cadence_days?: Json
          stage_reopen_permissions?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active_matter_conversion_gates?: Json
          auto_closure_after_days?: number | null
          automation_message_settings?: Json | null
          consultation_fee_rules?: Json
          consultation_reminder_hours?: Json
          contact_attempt_cadence_days?: Json
          created_at?: string
          enabled_channels?: Json
          final_closure_messages_mode?: string
          id?: string
          lawyer_approval_requirements?: Json
          mandatory_tasks_by_stage?: Json
          no_show_cadence_days?: Json
          payment_followup_cadence_days?: Json
          retainer_followup_cadence_days?: Json
          stage_reopen_permissions?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_workflow_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      // ── matter_deficiencies  -  Migration 127, Sprint 6 Week 1 ─────────────
      matter_deficiencies: {
        Row: {
          id: string
          tenant_id: string
          matter_id: string
          stage_id: string | null
          created_by: string
          assigned_to_user_id: string | null
          severity: 'minor' | 'major' | 'critical'
          category: string
          description: string
          status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'reopened'
          reopen_count: number
          chronic_flag: boolean
          resolution_notes: string | null
          resolution_evidence_path: string | null
          resolved_at: string | null
          resolved_by: string | null
          reopened_at: string | null
          reopened_by: string | null
          chronic_escalated_at: string | null
          chronic_escalated_to: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          matter_id: string
          stage_id?: string | null
          created_by: string
          assigned_to_user_id?: string | null
          severity: 'minor' | 'major' | 'critical'
          category: string
          description: string
          status?: 'open' | 'in_progress' | 'resolved' | 'closed' | 'reopened'
          reopen_count?: number
          chronic_flag?: boolean
          resolution_notes?: string | null
          resolution_evidence_path?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          chronic_escalated_at?: string | null
          chronic_escalated_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          stage_id?: string | null
          assigned_to_user_id?: string | null
          severity?: 'minor' | 'major' | 'critical'
          category?: string
          description?: string
          status?: 'open' | 'in_progress' | 'resolved' | 'closed' | 'reopened'
          reopen_count?: number
          chronic_flag?: boolean
          resolution_notes?: string | null
          resolution_evidence_path?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          chronic_escalated_at?: string | null
          chronic_escalated_to?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      // ─── Command Centre Tables (Migration 156) ──────────────────────────
      intake_sessions: {
        Row: {
          id: string
          tenant_id: string
          lead_id: string
          user_id: string | null
          status: string
          transcript: string | null
          summary: string | null
          extracted_entities: Json | null
          suggested_stream: string | null
          suggested_matter_type_id: string | null
          recommendation_confidence: number | null
          started_at: string
          finalised_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          lead_id: string
          user_id?: string | null
          status?: string
          transcript?: string | null
          summary?: string | null
          extracted_entities?: Json | null
          suggested_stream?: string | null
          suggested_matter_type_id?: string | null
          recommendation_confidence?: number | null
          started_at?: string
          finalised_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          lead_id?: string
          user_id?: string | null
          status?: string
          transcript?: string | null
          summary?: string | null
          extracted_entities?: Json | null
          suggested_stream?: string | null
          suggested_matter_type_id?: string | null
          recommendation_confidence?: number | null
          started_at?: string
          finalised_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_bypass_log: {
        Row: {
          id: string
          tenant_id: string
          lead_id: string
          matter_id: string | null
          user_id: string
          gate_name: string
          bypass_reason: string
          user_role: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          lead_id: string
          matter_id?: string | null
          user_id: string
          gate_name: string
          bypass_reason: string
          user_role: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          lead_id?: string
          matter_id?: string | null
          user_id?: string
          gate_name?: string
          bypass_reason?: string
          user_role?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_bypass_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_bypass_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_bypass_log_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_bypass_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_runs: {
        Row: {
          id: string
          tenant_id: string
          matter_id: string
          lead_id: string | null
          user_id: string | null
          fee_snapshot_status: string
          portal_creation_status: string
          blueprint_injection_status: string
          portal_link_id: string | null
          document_slots_created: number | null
          fee_snapshot_data: Json | null
          error_log: Json | null
          started_at: string
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          matter_id: string
          lead_id?: string | null
          user_id?: string | null
          fee_snapshot_status?: string
          portal_creation_status?: string
          blueprint_injection_status?: string
          portal_link_id?: string | null
          document_slots_created?: number | null
          fee_snapshot_data?: Json | null
          error_log?: Json | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          matter_id?: string
          lead_id?: string | null
          user_id?: string | null
          fee_snapshot_status?: string
          portal_creation_status?: string
          blueprint_injection_status?: string
          portal_link_id?: string | null
          document_slots_created?: number | null
          fee_snapshot_data?: Json | null
          error_log?: Json | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_runs_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_runs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_drops: {
        Row: {
          id: string
          temp_session_id: string
          content_hash: string
          file_name: string
          file_size: number
          mime_type: string
          storage_path: string
          source: string
          claimed_matter_id: string | null
          claimed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          temp_session_id: string
          content_hash: string
          file_name: string
          file_size?: number
          mime_type?: string
          storage_path: string
          source?: string
          claimed_matter_id?: string | null
          claimed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          temp_session_id?: string
          content_hash?: string
          file_name?: string
          file_size?: number
          mime_type?: string
          storage_path?: string
          source?: string
          claimed_matter_id?: string | null
          claimed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_drops_claimed_matter_id_fkey"
            columns: ["claimed_matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_categories: {
        Row: {
          id: string
          tenant_id: string
          name: string
          slug: string
          description: string | null
          color: string
          icon: string
          sort_order: number
          is_active: boolean
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          slug: string
          description?: string | null
          color?: string
          icon?: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
          created_by?: string | null
        }
        Update: {
          name?: string
          slug?: string
          description?: string | null
          color?: string
          icon?: string
          sort_order?: number
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "wiki_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_playbooks: {
        Row: {
          id: string
          tenant_id: string
          category_id: string | null
          title: string
          slug: string
          description: string | null
          content: Json
          tags: string[]
          status: string
          is_pinned: boolean
          version_number: number
          practice_area_id: string | null
          matter_type_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          category_id?: string | null
          title: string
          slug: string
          description?: string | null
          content?: Json
          tags?: string[]
          status?: string
          is_pinned?: boolean
          version_number?: number
          practice_area_id?: string | null
          matter_type_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          category_id?: string | null
          title?: string
          slug?: string
          description?: string | null
          content?: Json
          tags?: string[]
          status?: string
          is_pinned?: boolean
          version_number?: number
          practice_area_id?: string | null
          matter_type_id?: string | null
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wiki_playbooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_playbooks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "wiki_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_playbook_versions: {
        Row: {
          id: string
          tenant_id: string
          playbook_id: string
          version_number: number
          title: string
          content: Json
          change_summary: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          playbook_id: string
          version_number: number
          title: string
          content?: Json
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          version_number?: number
          title?: string
          content?: Json
          change_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wiki_playbook_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_playbook_versions_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "wiki_playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_snippets: {
        Row: {
          id: string
          tenant_id: string
          category_id: string | null
          title: string
          content: string
          snippet_type: string
          tags: string[]
          use_count: number
          is_favourite: boolean
          practice_area_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          category_id?: string | null
          title: string
          content: string
          snippet_type?: string
          tags?: string[]
          use_count?: number
          is_favourite?: boolean
          practice_area_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          category_id?: string | null
          title?: string
          content?: string
          snippet_type?: string
          tags?: string[]
          use_count?: number
          is_favourite?: boolean
          practice_area_id?: string | null
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wiki_snippets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_snippets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "wiki_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      norva_ear_sessions: {
        Row: {
          id: string
          tenant_id: string
          matter_id: string | null
          user_id: string
          title: string | null
          status: string
          consent_granted: boolean
          consent_granted_at: string | null
          consent_method: string | null
          participants: string[]
          duration_seconds: number | null
          transcript: string | null
          transcript_english: string | null
          source_language: string | null
          extracted_facts: Json
          anchored_fields: Json
          raw_audio_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          matter_id?: string | null
          user_id: string
          title?: string | null
          status?: string
          consent_granted: boolean
          consent_granted_at?: string | null
          consent_method?: string | null
          participants?: string[]
          duration_seconds?: number | null
          transcript?: string | null
          transcript_english?: string | null
          source_language?: string | null
          extracted_facts?: Json
          anchored_fields?: Json
          raw_audio_path?: string | null
        }
        Update: {
          title?: string | null
          status?: string
          duration_seconds?: number | null
          transcript?: string | null
          transcript_english?: string | null
          source_language?: string | null
          extracted_facts?: Json
          anchored_fields?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "norva_ear_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_optimizer_scans: {
        Row: {
          id: string
          tenant_id: string
          matter_id: string
          document_id: string | null
          scanned_by: string
          readability_score: number | null
          keyword_coverage: Json
          structure_issues: Json
          recommendations: Json
          metadata_zones: Json
          status: string
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          matter_id: string
          document_id?: string | null
          scanned_by: string
          readability_score?: number | null
          keyword_coverage?: Json
          structure_issues?: Json
          recommendations?: Json
          metadata_zones?: Json
          status?: string
          error_message?: string | null
        }
        Update: {
          readability_score?: number | null
          keyword_coverage?: Json
          structure_issues?: Json
          recommendations?: Json
          metadata_zones?: Json
          status?: string
          error_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_optimizer_scans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      case_law_alerts: {
        Row: {
          id: string
          tenant_id: string
          alert_type: string
          title: string
          summary: string | null
          source_url: string | null
          source_citation: string | null
          court: string | null
          jurisdiction: string | null
          practice_area_id: string | null
          keywords: string[]
          relevance_score: number | null
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          affected_matter_ids: string[]
          raw_data: Json
          decision_date: string | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          alert_type?: string
          title: string
          summary?: string | null
          source_url?: string | null
          source_citation?: string | null
          court?: string | null
          jurisdiction?: string | null
          practice_area_id?: string | null
          keywords?: string[]
          relevance_score?: number | null
          status?: string
          affected_matter_ids?: string[]
          raw_data?: Json
          decision_date?: string | null
        }
        Update: {
          title?: string
          summary?: string | null
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          affected_matter_ids?: string[]
          acknowledged_at?: string | null
          acknowledged_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_law_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gold_standard_templates: {
        Row: {
          id: string
          tenant_id: string
          source_matter_id: string
          case_type: string
          matter_type_name: string | null
          readability_score: number | null
          grade: string
          keyword_density: Json
          document_structure: Json
          zone_coverage: Json
          days_to_approval: number | null
          playbook_id: string | null
          playbook_title: string | null
          applicant_redacted: string
          approved_at: string | null
          extracted_by: string | null
          created_at: string
          is_active: boolean
        }
        Insert: {
          id?: string
          tenant_id: string
          source_matter_id: string
          case_type?: string
          matter_type_name?: string | null
          readability_score?: number | null
          grade?: string
          keyword_density?: Json
          document_structure?: Json
          zone_coverage?: Json
          days_to_approval?: number | null
          playbook_id?: string | null
          playbook_title?: string | null
          applicant_redacted?: string
          approved_at?: string | null
          extracted_by?: string | null
        }
        Update: {
          readability_score?: number | null
          grade?: string
          keyword_density?: Json
          document_structure?: Json
          zone_coverage?: Json
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "gold_standard_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      // ─── Directive 018/021/023: Continuity Engine & Shadow Matter ────────
      address_history: {
        Row: {
          id: string
          tenant_id: string
          contact_id: string
          matter_id: string | null
          label: string | null
          address_line1: string
          address_line2: string | null
          city: string
          province_state: string | null
          postal_code: string | null
          country: string
          start_date: string
          end_date: string | null
          is_current: boolean
          source: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          contact_id: string
          matter_id?: string | null
          label?: string | null
          address_line1: string
          address_line2?: string | null
          city: string
          province_state?: string | null
          postal_code?: string | null
          country?: string
          start_date: string
          end_date?: string | null
          is_current?: boolean
          source?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          contact_id?: string
          matter_id?: string | null
          label?: string | null
          address_line1?: string
          address_line2?: string | null
          city?: string
          province_state?: string | null
          postal_code?: string | null
          country?: string
          start_date?: string
          end_date?: string | null
          is_current?: boolean
          source?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "address_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "address_history_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "address_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_history: {
        Row: {
          id: string
          tenant_id: string
          contact_id: string
          matter_id: string | null
          history_type: string
          label: string | null
          organization: string | null
          position_title: string | null
          city: string | null
          province_state: string | null
          country: string | null
          start_date: string
          end_date: string | null
          is_current: boolean
          source: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          contact_id: string
          matter_id?: string | null
          history_type?: string
          label?: string | null
          organization?: string | null
          position_title?: string | null
          city?: string | null
          province_state?: string | null
          country?: string | null
          start_date: string
          end_date?: string | null
          is_current?: boolean
          source?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          contact_id?: string
          matter_id?: string | null
          history_type?: string
          label?: string | null
          organization?: string | null
          position_title?: string | null
          city?: string | null
          province_state?: string | null
          country?: string | null
          start_date?: string
          end_date?: string | null
          is_current?: boolean
          source?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_history_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_triggers: {
        Row: {
          id: string
          tenant_id: string
          contact_id: string
          document_type: string
          expiry_date: string
          trigger_at_days: number[]
          last_triggered_at: string | null
          last_trigger_days: number | null
          shadow_matter_id: string | null
          status: string
          source_matter_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          contact_id: string
          document_type: string
          expiry_date: string
          trigger_at_days?: number[]
          last_triggered_at?: string | null
          last_trigger_days?: number | null
          shadow_matter_id?: string | null
          status?: string
          source_matter_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          contact_id?: string
          document_type?: string
          expiry_date?: string
          trigger_at_days?: number[]
          last_triggered_at?: string | null
          last_trigger_days?: number | null
          shadow_matter_id?: string | null
          status?: string
          source_matter_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_triggers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_triggers_shadow_matter_id_fkey"
            columns: ["shadow_matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_triggers_source_matter_id_fkey"
            columns: ["source_matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_triggers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_overrides: {
        Row: {
          id: string
          tenant_id: string
          matter_id: string
          override_type: string
          blocked_node: string
          original_status: string
          justification: string
          justification_hash: string
          authorized_by: string
          authorized_role: string
          partner_pin_hash: string
          genesis_amendment_hash: string | null
          is_active: boolean
          revoked_at: string | null
          revoked_by: string | null
          revocation_reason: string | null
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          matter_id: string
          override_type: string
          blocked_node: string
          original_status: string
          justification: string
          justification_hash: string
          authorized_by: string
          authorized_role: string
          partner_pin_hash: string
          genesis_amendment_hash?: string | null
          is_active?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          revocation_reason?: string | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          matter_id?: string
          override_type?: string
          blocked_node?: string
          original_status?: string
          justification?: string
          justification_hash?: string
          authorized_by?: string
          authorized_role?: string
          partner_pin_hash?: string
          genesis_amendment_hash?: string | null
          is_active?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          revocation_reason?: string | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_overrides_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_overrides_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_overrides_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_global_audit_ledger: {
        Row: {
          id: string
          tenant_id: string
          event_type: string
          event_payload: Json
          event_hash: string
          prev_hash: string
          chain_seq: number
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          event_type: string
          event_payload?: Json
          event_hash: string
          prev_hash: string
          chain_seq: number
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          event_type?: string
          event_payload?: Json
          event_hash?: string
          prev_hash?: string
          chain_seq?: number
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_global_audit_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_global_audit_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_branding_metadata: {
        Row: {
          id: string
          tenant_id: string
          logo_dominant_color: string | null
          logo_width_px: number | null
          logo_height_px: number | null
          letterhead_version: number
          activated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          logo_dominant_color?: string | null
          logo_width_px?: number | null
          logo_height_px?: number | null
          letterhead_version?: number
          activated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          logo_dominant_color?: string | null
          logo_width_px?: number | null
          logo_height_px?: number | null
          letterhead_version?: number
          activated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_branding_metadata_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_branding_metadata_activated_by_fkey"
            columns: ["activated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mv_lead_metrics: {
        Row: {
          assigned_to: string | null
          avg_days_in_pipeline: number | null
          converted_count: number | null
          lead_count: number | null
          month: string | null
          pipeline_id: string | null
          practice_area_id: string | null
          source: string | null
          stage_name: string | null
          status: string | null
          temperature: string | null
          tenant_id: string | null
          total_estimated_value: number | null
          total_weighted_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_matter_metrics: {
        Row: {
          avg_days_open: number | null
          billing_type: string | null
          matter_count: number | null
          month: string | null
          practice_area_id: string | null
          responsible_lawyer_id: string | null
          status: string | null
          tenant_id: string | null
          total_billed: number | null
          total_estimated: number | null
          total_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matters_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_responsible_lawyer_id_fkey"
            columns: ["responsible_lawyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_revenue_summary: {
        Row: {
          account_type: string | null
          avg_payment: number | null
          month: string | null
          payment_count: number | null
          payment_method: string | null
          practice_area_id: string | null
          responsible_lawyer_id: string | null
          tenant_id: string | null
          total_revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matters_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_responsible_lawyer_id_fkey"
            columns: ["responsible_lawyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_lead_funnel_summary: {
        Row: {
          conversion_rate_pct: number | null
          leads_advanced: number | null
          leads_entered: number | null
          stage: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_lead_source_attribution: {
        Row: {
          active: number | null
          campaign_source: string | null
          closed: number | null
          conversion_rate_pct: number | null
          converted: number | null
          practice_area_id: string | null
          referral_source: string | null
          source: string | null
          tenant_id: string | null
          total_leads: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_practice_area_id_fkey"
            columns: ["practice_area_id"]
            isOneToOne: false
            referencedRelation: "practice_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_lead_stage_duration: {
        Row: {
          avg_days_in_stage: number | null
          avg_hours_in_stage: number | null
          sample_count: number | null
          stage: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      jurisdictions: {
        Row: {
          id: string
          code: string
          name: string
          type: string
          parent_id: string | null
          aliases: Json
          is_active: boolean
          sort_order: number
        }
        Insert: {
          id?: string
          code: string
          name: string
          type?: string
          parent_id?: string | null
          aliases?: Json
          is_active?: boolean
          sort_order?: number
        }
        Update: {
          id?: string
          code?: string
          name?: string
          type?: string
          parent_id?: string | null
          aliases?: Json
          is_active?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      lead_readiness_fields: {
        Row: {
          id: string
          tenant_id: string
          matter_type_id: string
          field_key: string
          field_label: string
          field_source: string
          is_required: boolean
          weight: number
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          matter_type_id: string
          field_key: string
          field_label: string
          field_source: string
          is_required?: boolean
          weight?: number
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          matter_type_id?: string
          field_key?: string
          field_label?: string
          field_source?: string
          is_required?: boolean
          weight?: number
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_readiness_fields_matter_type_id_fkey"
            columns: ["matter_type_id"]
            isOneToOne: false
            referencedRelation: "matter_types"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_jurisdiction_matches: {
        Row: {
          id: string
          tenant_id: string
          lead_id: string
          raw_input: string
          matched_jurisdiction_id: string | null
          match_type: string
          confidence: number
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          lead_id: string
          raw_input: string
          matched_jurisdiction_id?: string | null
          match_type: string
          confidence?: number
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          lead_id?: string
          raw_input?: string
          matched_jurisdiction_id?: string | null
          match_type?: string
          confidence?: number
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_jurisdiction_matches_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_jurisdiction_matches_jurisdiction_id_fkey"
            columns: ["matched_jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_import_sources: {
        Row: {
          id: string
          tenant_id: string
          name: string
          platform: string
          default_source_tag: string | null
          default_campaign_tag: string | null
          utm_source: string | null
          utm_medium: string | null
          utm_campaign: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          platform?: string
          default_source_tag?: string | null
          default_campaign_tag?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          platform?: string
          default_source_tag?: string | null
          default_campaign_tag?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      lead_import_staging: {
        Row: {
          id: string
          batch_id: string
          tenant_id: string
          row_number: number
          first_name: string | null
          last_name: string | null
          email: string | null
          phone: string | null
          date_of_birth: string | null
          nationality: string | null
          country_of_birth: string | null
          passport_number: string | null
          raw_jurisdiction: string | null
          matched_jurisdiction_id: string | null
          jurisdiction_match_type: string | null
          jurisdiction_match_confidence: number | null
          jurisdiction_needs_review: boolean
          user_jurisdiction_override: string | null
          matter_type_name: string | null
          temperature: string | null
          estimated_value: number | null
          notes: string | null
          source_tag: string | null
          campaign_tag: string | null
          utm_source: string | null
          utm_medium: string | null
          utm_campaign: string | null
          source_data: Record<string, unknown> | null
          validation_status: string
          validation_errors: string[] | null
          conflict_status: string
          conflict_details: Record<string, unknown>[] | null
          user_conflict_override: string | null
          committed: boolean
          created_lead_id: string | null
          created_contact_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          tenant_id: string
          row_number: number
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone?: string | null
          date_of_birth?: string | null
          nationality?: string | null
          country_of_birth?: string | null
          passport_number?: string | null
          raw_jurisdiction?: string | null
          matched_jurisdiction_id?: string | null
          jurisdiction_match_type?: string | null
          jurisdiction_match_confidence?: number | null
          jurisdiction_needs_review?: boolean
          user_jurisdiction_override?: string | null
          matter_type_name?: string | null
          temperature?: string | null
          estimated_value?: number | null
          notes?: string | null
          source_tag?: string | null
          campaign_tag?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          source_data?: Record<string, unknown> | null
          validation_status?: string
          validation_errors?: string[] | null
          conflict_status?: string
          conflict_details?: Record<string, unknown>[] | null
          user_conflict_override?: string | null
          committed?: boolean
          created_lead_id?: string | null
          created_contact_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          batch_id?: string
          tenant_id?: string
          row_number?: number
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone?: string | null
          date_of_birth?: string | null
          nationality?: string | null
          country_of_birth?: string | null
          passport_number?: string | null
          raw_jurisdiction?: string | null
          matched_jurisdiction_id?: string | null
          jurisdiction_match_type?: string | null
          jurisdiction_match_confidence?: number | null
          jurisdiction_needs_review?: boolean
          user_jurisdiction_override?: string | null
          matter_type_name?: string | null
          temperature?: string | null
          estimated_value?: number | null
          notes?: string | null
          source_tag?: string | null
          campaign_tag?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          source_data?: Record<string, unknown> | null
          validation_status?: string
          validation_errors?: string[] | null
          conflict_status?: string
          conflict_details?: Record<string, unknown>[] | null
          user_conflict_override?: string | null
          committed?: boolean
          created_lead_id?: string | null
          created_contact_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_import_staging_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      ircc_submission_checklist: {
        Row: {
          id: string
          tenant_id: string
          matter_id: string
          item_key: string
          label: string
          category: string
          sort_order: number
          is_required: boolean
          status: string
          completed_at: string | null
          completed_by: string | null
          notes: string | null
          ircc_ref: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          matter_id: string
          item_key: string
          label: string
          category?: string
          sort_order?: number
          is_required?: boolean
          status?: string
          completed_at?: string | null
          completed_by?: string | null
          notes?: string | null
          ircc_ref?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          matter_id?: string
          item_key?: string
          label?: string
          category?: string
          sort_order?: number
          is_required?: boolean
          status?: string
          completed_at?: string | null
          completed_by?: string | null
          notes?: string | null
          ircc_ref?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ircc_submission_checklist_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      fn_generate_matter_genesis_block: {
        Args: {
          p_matter_id: string
          p_tenant_id: string
          p_user_id: string
          p_conflict_search_id: string
        }
        Returns: Record<string, unknown>
      }
      fn_revoke_genesis_block: {
        Args: {
          p_matter_id: string
          p_tenant_id: string
          p_user_id: string
          p_reason: string
        }
        Returns: Record<string, unknown>
      }
      fn_initialize_shadow_matter: {
        Args: {
          p_contact_id: string
          p_tenant_id: string
          p_user_id: string
          p_matter_type_id: string
          p_source_matter_id?: string
          p_trigger_id?: string
        }
        Returns: Record<string, unknown>
      }
      fn_initialize_firm_sovereignty: {
        Args: {
          p_tenant_id: string
          p_user_id: string
        }
        Returns: Json
      }
      fn_log_compliance_override: {
        Args: {
          p_tenant_id: string
          p_matter_id: string
          p_user_id: string
          p_override_type: string
          p_blocked_node: string
          p_original_status: string
          p_justification: string
          p_partner_pin: string
        }
        Returns: Json
      }
      fn_atomic_lead_to_matter: {
        Args: {
          p_lead_id: string
          p_tenant_id: string
          p_user_id: string
          p_title?: string | null
          p_practice_area_id?: string | null
          p_matter_type_id?: string | null
          p_description?: string | null
        }
        Returns: Json
      }
      fn_bulk_conflict_check: {
        Args: {
          p_emails: string[]
          p_passports: string[]
        }
        Returns: Record<string, unknown>
      }
      create_judicial_review_matter: {
        Args: {
          p_source_matter_id: string
          p_matter_type_id?: string
          p_auth_user_id?: string
        }
        Returns: Json
      }
      acquire_idempotency_lock: {
        Args: { p_idempotency_key: string }
        Returns: Json
      }
      add_form_pack_artifact: {
        Args: {
          p_checksum_sha256: string
          p_file_name: string
          p_file_size: number
          p_form_code: string
          p_is_final: boolean
          p_storage_path: string
          p_tenant_id: string
          p_version_id: string
        }
        Returns: string
      }
      apply_risk_override: {
        Args: {
          p_intake_id: string
          p_matter_id: string
          p_override_level: string
          p_override_reason: string
          p_previous_level?: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: Json
      }
      approve_form_pack_version: {
        Args: {
          p_approved_by: string
          p_tenant_id: string
          p_version_id: string
        }
        Returns: Json
      }
      calculate_invoice_totals: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      check_matter_access: {
        Args: { p_matter_id: string; p_user_id: string }
        Returns: boolean
      }
      create_form_pack_version: {
        Args: {
          p_checksum_sha256: string
          p_file_name: string
          p_file_size: number
          p_form_code: string
          p_generated_by: string
          p_idempotency_key: string
          p_input_snapshot: Json
          p_is_final?: boolean
          p_mapping_version: string
          p_matter_id: string
          p_pack_type: string
          p_resolved_fields: Json
          p_storage_path: string
          p_template_checksum: string
          p_tenant_id: string
          p_validation_result: Json
        }
        Returns: Json
      }
      execute_action_atomic: {
        Args: {
          p_action_config: Json
          p_action_label?: string
          p_action_type: string
          p_activity_contact_id?: string
          p_activity_description?: string
          p_activity_matter_id?: string
          p_activity_metadata?: Json
          p_activity_title?: string
          p_activity_type?: string
          p_entity_id: string
          p_entity_type: string
          p_idempotency_key?: string
          p_new_state?: Json
          p_performed_by: string
          p_previous_state?: Json
          p_shift_id?: string
          p_source: string
          p_tenant_id: string
        }
        Returns: Json
      }
      generate_invoice_number: {
        Args: { p_tenant_id: string; p_year?: number }
        Returns: string
      }
      get_current_tenant_id: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      has_billing_view: { Args: never; Returns: boolean }
      release_idempotency_lock: {
        Args: { p_idempotency_key: string }
        Returns: undefined
      }
      review_document_version: {
        Args: {
          p_action: string
          p_reason?: string
          p_slot_id: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: Json
      }
      seed_expiry_reminder_rules: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      seed_immigration_defaults: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      seed_post_submission_doc_types: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      set_tenant_context: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      snapshot_contact_profile_to_matter: {
        Args: {
          p_contact_id: string
          p_matter_person_id: string
          p_synced_by?: string
          p_tenant_id: string
        }
        Returns: number
      }
      sync_matter_profile_to_canonical: {
        Args: {
          p_contact_id: string
          p_fields_to_sync?: string[]
          p_matter_person_id: string
          p_synced_by?: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      upload_document_version: {
        Args: {
          p_document_id: string
          p_file_name: string
          p_file_size: number
          p_file_type: string
          p_slot_id: string
          p_storage_path: string
          p_tenant_id: string
          p_uploaded_by: string
        }
        Returns: number
      }
      populate_checklist_from_stream: {
        Args: {
          p_matter_id: string
          p_tenant_id: string
          p_program_cat: string
          p_jurisdiction: string
        }
        Returns: number
      }
      fn_calculate_lead_readiness: {
        Args: { p_lead_id: string }
        Returns: Json
      }
      fn_conflict_check_alpha: {
        Args: { p_lead_id: string }
        Returns: Json
      }
      fn_match_jurisdiction: {
        Args: { p_raw_input: string }
        Returns: Json
      }
    }
    Enums: {
      doc_condition_operator:
        | "equals"
        | "not_equals"
        | "is_empty"
        | "is_not_empty"
        | "greater_than"
        | "less_than"
        | "contains"
        | "in_list"
        | "truthy"
        | "falsy"
      doc_field_type:
        | "text"
        | "number"
        | "date"
        | "currency"
        | "boolean"
        | "address"
        | "json"
        | "signature"
      doc_generation_mode: "manual" | "auto" | "workflow_trigger"
      doc_instance_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "sent"
        | "partially_signed"
        | "signed"
        | "declined"
        | "voided"
        | "superseded"
      doc_signature_request_status:
        | "pending"
        | "sent"
        | "opened"
        | "partially_signed"
        | "completed"
        | "declined"
        | "expired"
        | "cancelled"
      doc_signer_status:
        | "pending"
        | "sent"
        | "viewed"
        | "signed"
        | "declined"
        | "expired"
      doc_template_status: "draft" | "published" | "archived" | "superseded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      doc_condition_operator: [
        "equals",
        "not_equals",
        "is_empty",
        "is_not_empty",
        "greater_than",
        "less_than",
        "contains",
        "in_list",
        "truthy",
        "falsy",
      ],
      doc_field_type: [
        "text",
        "number",
        "date",
        "currency",
        "boolean",
        "address",
        "json",
        "signature",
      ],
      doc_generation_mode: ["manual", "auto", "workflow_trigger"],
      doc_instance_status: [
        "draft",
        "pending_review",
        "approved",
        "sent",
        "partially_signed",
        "signed",
        "declined",
        "voided",
        "superseded",
      ],
      doc_signature_request_status: [
        "pending",
        "sent",
        "opened",
        "partially_signed",
        "completed",
        "declined",
        "expired",
        "cancelled",
      ],
      doc_signer_status: [
        "pending",
        "sent",
        "viewed",
        "signed",
        "declined",
        "expired",
      ],
      doc_template_status: ["draft", "published", "archived", "superseded"],
    },
  },
} as const


// ── Enums / Union Types ───────────────────────────────────────────────────────

export type InvoiceStatus =
  | 'draft'
  | 'finalized'
  | 'sent'
  | 'viewed'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'void'
  | 'written_off'

export type InvoiceLineCategory = 'fee' | 'disbursement' | 'soft_cost' | 'hard_cost'

export type InvoiceLineType =
  | 'hourly'
  | 'flat_fee'
  | 'manual_fee'
  | 'disbursement_external'
  | 'soft_cost_internal'
  | 'hard_cost_direct'
  | 'manual'

export type InvoiceLineSourceType =
  | 'time_entry'
  | 'disbursement_entry'
  | 'soft_cost_entry'
  | 'hard_cost_entry'
  | 'manual'

export type AdjustmentType = 'discount' | 'write_down' | 'write_off' | 'credit_note'
export type AdjustmentScope = 'invoice_level' | 'line_level' | 'category_level'
export type AdjustmentApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved'
export type AdjustmentCalculationType = 'percentage' | 'fixed_amount'

export type TrustAllocationStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'reversed'

export type PaymentSource = 'direct' | 'trust_applied' | 'credit_note'
export type DeliveryMethod = 'email' | 'portal' | 'manual'
export type DeliveryStatus = 'sent' | 'delivered' | 'failed' | 'viewed'

export type InvoiceAuditEventType =
  | 'created'
  | 'draft_saved'
  | 'line_added'
  | 'line_edited'
  | 'line_deleted'
  | 'adjustment_added'
  | 'adjustment_approved'
  | 'adjustment_rejected'
  | 'finalized'
  | 'sent'
  | 'resent'
  | 'delivery_failed'
  | 'payment_recorded'
  | 'payment_voided'
  | 'trust_applied'
  | 'trust_confirmed'
  | 'trust_rejected'
  | 'trust_cancelled'
  | 'voided'
  | 'status_changed'
  | 'pdf_downloaded'
  | 'viewed'
  | 'template_applied'
  | 'payment_plan_created'
  | 'payment_plan_approved'
  | 'payment_plan_cancelled'
  | 'payment_plan_completed'
  | 'instalment_paid'

// ── billing_categories ────────────────────────────────────────────────────────

export type BillingCategoryRow = {
  id: string
  code: InvoiceLineCategory
  label: string
  description: string | null
  sort_order: number
  is_active: boolean
}

// ── disbursement_categories ───────────────────────────────────────────────────

export type DisbursementCategoryRow = {
  id: string
  tenant_id: string | null   // null = system default
  code: string
  label: string
  default_is_taxable: boolean
  default_is_recoverable: boolean
  is_active: boolean
  created_at: string
}

export type DisbursementCategoryInsert = {
  tenant_id: string | null
  code: string
  label: string
  id?: string
  default_is_taxable?: boolean
  default_is_recoverable?: boolean
  is_active?: boolean
  created_at?: string
}

export type DisbursementCategoryUpdate = Partial<DisbursementCategoryInsert>

// ── tax_jurisdictions ─────────────────────────────────────────────────────────

export type TaxJurisdictionRow = {
  id: string
  code: string               // CA-ON, CA-AB, CA-BC, CA-QC, GENERIC, etc.
  name: string
  country_code: string
  region_code: string | null
  is_active: boolean
}

// ── tax_profiles ──────────────────────────────────────────────────────────────

export type TaxProfileRow = {
  id: string
  tenant_id: string
  jurisdiction_id: string
  name: string
  description: string | null
  is_default: boolean
  effective_from: string | null
  effective_to: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type TaxProfileInsert = {
  tenant_id: string
  jurisdiction_id: string
  name: string
  id?: string
  description?: string | null
  is_default?: boolean
  effective_from?: string | null
  effective_to?: string | null
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export type TaxProfileUpdate = Partial<TaxProfileInsert>

// ── tax_codes ─────────────────────────────────────────────────────────────────

export type TaxCodeRow = {
  id: string
  tenant_id: string
  tax_profile_id: string
  code: string               // HST, GST, PST, QST, EXEMPT, ZERO
  label: string              // Display label on invoice
  rate: number               // decimal e.g. 0.13 for 13%
  applies_to_fees: boolean
  applies_to_disbursements: boolean
  applies_to_soft_costs: boolean
  applies_to_hard_costs: boolean
  is_default_for_profile: boolean
  is_active: boolean
}

export type TaxCodeInsert = {
  tenant_id: string
  tax_profile_id: string
  code: string
  label: string
  id?: string
  rate?: number
  applies_to_fees?: boolean
  applies_to_disbursements?: boolean
  applies_to_soft_costs?: boolean
  applies_to_hard_costs?: boolean
  is_default_for_profile?: boolean
  is_active?: boolean
}

export type TaxCodeUpdate = Partial<TaxCodeInsert>

// ── tax_registrations ─────────────────────────────────────────────────────────

export type TaxRegistrationRow = {
  id: string
  tenant_id: string
  jurisdiction_id: string
  registration_number: string
  registration_type: string  // HST, GST, QST, etc.
  effective_from: string | null
  effective_to: string | null
  is_active: boolean
  created_at: string
}

export type TaxRegistrationInsert = {
  tenant_id: string
  jurisdiction_id: string
  registration_number: string
  registration_type: string
  id?: string
  effective_from?: string | null
  effective_to?: string | null
  is_active?: boolean
  created_at?: string
}

export type TaxRegistrationUpdate = Partial<TaxRegistrationInsert>

// ── invoice_number_sequences ──────────────────────────────────────────────────

export type InvoiceNumberSequenceRow = {
  id: string
  tenant_id: string
  year: number
  next_val: number
}

// ── invoice_templates ─────────────────────────────────────────────────────────

export type InvoiceTemplateType = 'firm_default' | 'matter_type' | 'practice_area' | 'custom'

export type InvoiceTemplateRow = {
  id: string
  tenant_id: string
  name: string
  template_type: InvoiceTemplateType
  matter_type_code: string | null
  practice_area_code: string | null
  default_tax_profile_id: string | null
  logo_url: string | null
  header_html: string | null
  footer_html: string | null
  payment_instructions: string | null
  trust_statement_wording: string | null
  overdue_wording: string | null
  standard_notes: string | null
  lawyer_signature_block: string | null
  is_default: boolean
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type InvoiceTemplateInsert = {
  tenant_id: string
  name: string
  id?: string
  template_type?: InvoiceTemplateType
  matter_type_code?: string | null
  practice_area_code?: string | null
  default_tax_profile_id?: string | null
  logo_url?: string | null
  header_html?: string | null
  footer_html?: string | null
  payment_instructions?: string | null
  trust_statement_wording?: string | null
  overdue_wording?: string | null
  standard_notes?: string | null
  lawyer_signature_block?: string | null
  is_default?: boolean
  is_active?: boolean
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type InvoiceTemplateUpdate = Partial<InvoiceTemplateInsert>

// ── invoice_template_soft_cost_rates ─────────────────────────────────────────

export type SoftCostRateRow = {
  id: string
  template_id: string
  tenant_id: string
  description: string
  unit_label: string
  default_rate: number       // cents per unit
  default_tax_code_id: string | null
  sort_order: number
  is_active: boolean
}

export type SoftCostRateInsert = {
  template_id: string
  tenant_id: string
  description: string
  unit_label: string
  id?: string
  default_rate?: number
  default_tax_code_id?: string | null
  sort_order?: number
  is_active?: boolean
}

export type SoftCostRateUpdate = Partial<SoftCostRateInsert>

// ── discount_approval_thresholds ──────────────────────────────────────────────

export type DiscountApprovalThresholdRow = {
  id: string
  tenant_id: string
  threshold_type: 'percentage' | 'fixed_amount'
  threshold_value: number    // percentage: 0.15 = 15%; fixed_amount: cents
  approver_role: string
  applies_to_adjustment_types: AdjustmentType[]
  is_active: boolean
  created_at: string
}

export type DiscountApprovalThresholdInsert = {
  tenant_id: string
  threshold_type: 'percentage' | 'fixed_amount'
  threshold_value: number
  approver_role: string
  id?: string
  applies_to_adjustment_types?: AdjustmentType[]
  is_active?: boolean
  created_at?: string
}

// ── invoice_adjustments ───────────────────────────────────────────────────────

export type InvoiceAdjustmentRow = {
  id: string
  tenant_id: string
  invoice_id: string
  matter_id: string
  adjustment_type: AdjustmentType
  scope: AdjustmentScope
  line_item_id: string | null
  applies_to_category: InvoiceLineCategory | null
  calculation_type: AdjustmentCalculationType
  percentage_value: number | null     // decimal e.g. 0.10 = 10%
  fixed_amount_cents: number | null   // cents
  calculated_amount_cents: number     // cents  -  always populated
  is_pre_tax: boolean
  reason_code: string
  reason_note: string | null
  applied_by: string
  approved_by: string | null
  approval_status: AdjustmentApprovalStatus
  requires_approval: boolean
  approval_threshold_id: string | null
  created_at: string
  updated_at: string
}

export type InvoiceAdjustmentInsert = {
  tenant_id: string
  invoice_id: string
  matter_id: string
  adjustment_type: AdjustmentType
  scope: AdjustmentScope
  calculation_type: AdjustmentCalculationType
  calculated_amount_cents: number
  reason_code: string
  applied_by: string
  id?: string
  line_item_id?: string | null
  applies_to_category?: InvoiceLineCategory | null
  percentage_value?: number | null
  fixed_amount_cents?: number | null
  is_pre_tax?: boolean
  reason_note?: string | null
  approved_by?: string | null
  approval_status?: AdjustmentApprovalStatus
  requires_approval?: boolean
  approval_threshold_id?: string | null
  created_at?: string
  updated_at?: string
}

export type InvoiceAdjustmentUpdate = Partial<InvoiceAdjustmentInsert>

// ── invoice_trust_allocations ─────────────────────────────────────────────────

export type InvoiceTrustAllocationRow = {
  id: string
  tenant_id: string
  invoice_id: string
  matter_id: string
  amount_cents: number                 // BIGINT in DB
  trust_account_id: string
  trust_transaction_id: string | null  // set by trust module on confirmation
  allocation_status: TrustAllocationStatus
  requested_by: string
  requested_at: string
  confirmed_at: string | null
  confirmed_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type InvoiceTrustAllocationInsert = {
  tenant_id: string
  invoice_id: string
  matter_id: string
  amount_cents: number
  trust_account_id: string
  requested_by: string
  id?: string
  trust_transaction_id?: string | null
  allocation_status?: TrustAllocationStatus
  requested_at?: string
  confirmed_at?: string | null
  confirmed_by?: string | null
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export type InvoiceTrustAllocationUpdate = Partial<InvoiceTrustAllocationInsert>

// ── invoice_delivery_logs ─────────────────────────────────────────────────────

export type InvoiceDeliveryLogRow = {
  id: string
  tenant_id: string
  invoice_id: string
  delivery_method: DeliveryMethod
  recipient_email: string
  recipient_name: string | null
  sent_at: string
  sent_by: string
  delivery_status: DeliveryStatus
  viewed_at: string | null
  message_subject: string | null
  message_body_snapshot: string | null
  comms_message_id: string | null
  created_at: string
}

export type InvoiceDeliveryLogInsert = {
  tenant_id: string
  invoice_id: string
  recipient_email: string
  sent_by: string
  id?: string
  delivery_method?: DeliveryMethod
  recipient_name?: string | null
  sent_at?: string
  delivery_status?: DeliveryStatus
  viewed_at?: string | null
  message_subject?: string | null
  message_body_snapshot?: string | null
  comms_message_id?: string | null
  created_at?: string
}

// ── invoice_audit_log ─────────────────────────────────────────────────────────

export type InvoiceAuditLogRow = {
  id: string
  tenant_id: string
  invoice_id: string
  matter_id: string
  event_type: InvoiceAuditEventType
  event_description: string
  changed_fields: Record<string, { before: unknown; after: unknown }> | null
  performed_by: string
  performed_at: string
  ip_address: string | null
  user_agent: string | null
}

export type InvoiceAuditLogInsert = {
  tenant_id: string
  invoice_id: string
  matter_id: string
  event_type: InvoiceAuditEventType
  event_description: string
  performed_by: string
  id?: string
  changed_fields?: Record<string, { before: unknown; after: unknown }> | null
  performed_at?: string
  ip_address?: string | null
  user_agent?: string | null
}

// ── Composite view types (used by query hooks and UI) ────────────────────────

/** Full invoice with joined template and tax profile name */
export type InvoiceRow = Database['public']['Tables']['invoices']['Row']
export type InvoiceInsert = Database['public']['Tables']['invoices']['Insert']
export type InvoiceUpdate = Database['public']['Tables']['invoices']['Update']
export type InvoiceLineItemRow = Database['public']['Tables']['invoice_line_items']['Row']
export type InvoiceLineItemInsert = Database['public']['Tables']['invoice_line_items']['Insert']
export type InvoiceLineItemUpdate = Database['public']['Tables']['invoice_line_items']['Update']
export type PaymentRow = Database['public']['Tables']['payments']['Row']
export type PaymentInsert = Database['public']['Tables']['payments']['Insert']
export type PaymentUpdate = Database['public']['Tables']['payments']['Update']

/** Summary used in dashboard and list views */
export type InvoiceSummary = {
  id: string
  invoice_number: string
  matter_id: string
  matter_title: string
  contact_id: string | null
  contact_name: string | null
  status: InvoiceStatus
  issue_date: string
  due_date: string
  total_amount: number      // cents
  amount_paid: number       // cents
  balance_due: number       // cents = total_amount - amount_paid
  currency_code: string
}

/** Full invoice detail with all related records */
export type InvoiceDetail = InvoiceRow & {
  matter: { id: string; title: string; matter_number: string }
  contact: { id: string; first_name: string | null; last_name: string | null; organization_name: string | null } | null
  line_items: InvoiceLineItemRow[]
  adjustments: InvoiceAdjustmentRow[]
  payments: PaymentRow[]
  trust_allocations: InvoiceTrustAllocationRow[]
  delivery_logs: InvoiceDeliveryLogRow[]
  template: InvoiceTemplateRow | null
  tax_profile: TaxProfileRow | null
}

/** Used in invoice builder for live tax calculation */
export type TaxLineCalculation = {
  tax_code_id: string
  tax_code_label: string
  tax_rate: number
  taxable_base: number    // cents
  tax_amount: number      // cents
}

/** Result from calculate_invoice_totals() RPC */
export type InvoiceTotalsResult = {
  invoice_id: string
  subtotal_fees: number
  subtotal_disbursements: number
  subtotal_soft_costs: number
  subtotal_hard_costs: number
  subtotal: number
  total_adjustments: number
  taxable_subtotal: number
  tax_amount: number
  total_amount: number
  total_trust_applied: number
  total_payments_applied: number
  amount_paid: number
  balance_due: number
}

/** Payment plan record */
export type PaymentPlanRow = Database['public']['Tables']['payment_plans']['Row']
export type PaymentPlanInsert = Database['public']['Tables']['payment_plans']['Insert']
export type PaymentPlanUpdate = Database['public']['Tables']['payment_plans']['Update']

/** Individual instalment record within a payment plan */
export type PaymentPlanInstalmentRow = {
  id: string
  tenant_id: string
  payment_plan_id: string
  invoice_id: string
  instalment_number: number
  due_date: string
  amount_cents: number
  status: 'pending' | 'paid' | 'cancelled'
  payment_id: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
  /** Derived at query time  -  not stored in DB */
  is_overdue?: boolean
}

export type PaymentPlanInstalmentInsert = {
  tenant_id: string
  payment_plan_id: string
  invoice_id: string
  instalment_number: number
  due_date: string
  amount_cents: number
  id?: string
  status?: 'pending' | 'paid' | 'cancelled'
  payment_id?: string | null
  paid_at?: string | null
}

/** Idempotency log for processed Stripe webhook events */
export type StripeProcessedEventRow = {
  id: string
  event_id: string
  event_type: string
  tenant_id: string | null
  processed_at: string
}

export type StripeProcessedEventInsert = {
  event_id: string
  event_type: string
  tenant_id?: string | null
  id?: string
  processed_at?: string
}

/** Idempotency log for platform-admin bootstrap actions */
export type TenantSetupLogRow = {
  id: string
  tenant_id: string
  action: string
  starter_pack: string | null
  applied_at: string
  applied_by: string
  result: Json | null
}

export type TenantSetupLogInsert = {
  tenant_id: string
  action: string
  starter_pack?: string | null
  id?: string
  applied_at?: string
  applied_by?: string
  result?: Json | null
}

/** Manual onboarding checklist completions (auto-detected items are never stored) */
export type TenantOnboardingChecklistRow = {
  id: string
  tenant_id: string
  item_key: string
  completed_at: string
  completed_by: string | null
  notes: string | null
}

export type TenantOnboardingChecklistInsert = {
  tenant_id: string
  item_key: string
  completed_by?: string | null
  id?: string
  completed_at?: string
  notes?: string | null
}

/** Billing dashboard summary */
export type BillingDashboardStats = {
  draft_count: number
  finalized_count: number
  sent_count: number
  overdue_count: number
  partially_paid_count: number
  paid_count: number
  total_outstanding_cents: number
  total_overdue_cents: number
  total_collected_this_month_cents: number
  credit_balance_count: number
}

// ─── Onboarding Wizard ────────────────────────────────────────────────────────

/**
 * Typed answers collected during the onboarding wizard.
 * Each key corresponds to one wizard step; all keys are optional because
 * the wizard supports partial save-and-resume.
 */
export interface WizardAnswers {
  firmProfile?: {
    firmName?: string
    address?: string
    phone?: string
    website?: string
    primaryColour?: string
    secondaryColour?: string
    accentColour?: string
  }
  practiceModel?: {
    practiceAreas: Array<{ name: string; colour: string }>
  }
  matterNumbering?: {
    prefix: string
    format: 'PREFIX-YEAR-SEQ' | 'PREFIX-SEQ' | 'YEAR-SEQ' | 'SEQ'
    startingNumber: number
    separator: '-' | '/'
  }
  rolesSetup?: {
    useStandardRoles: boolean
    standardRoles: string[]
  }
  emailSetup?: {
    replyToAddress?: string
    senderName?: string
    emailSignatureEnabled: boolean
  }
  calendarSetup?: {
    workingDays: string[]
    workingHoursStart: string
    workingHoursEnd: string
    appointmentBufferMinutes: number
  }
  storageSetup?: {
    retentionYears: number
    defaultFolderStructure: 'matter-based' | 'client-based' | 'flat'
  }
  workflowSetup?: {
    autoCreateTasksOnStageAdvance: boolean
    autoCloseMatterOnTerminalStage: boolean
    deadlineReminderDays: number[]
  }
  documentTemplates?: {
    seedTemplates: boolean
    templateSet: 'immigration' | 'family-law' | 'real-estate' | 'general' | 'none'
  }
  customFields?: {
    enableCustomFields: boolean
  }
  portalSetup?: {
    enabled: boolean
    portalName?: string
    welcomeMessage?: string
  }
  notificationSetup?: {
    emailNotificationsEnabled: boolean
    deadlineReminderDays: number[]
    taskDueReminderEnabled: boolean
  }
  billingSetup?: {
    billingEnabled: boolean
    trustAccountingEnabled: boolean
    currency: string
    defaultPaymentTermDays: number
    invoicePrefix?: string
  }
  dataImport?: {
    importIntent: 'none' | 'import-later' | 'request-help'
  }
}

export interface ActivationLogEntry {
  action: string
  applied_at: string
  ok: boolean
  error?: string
}

/**
 * DB-layer types for tenant_onboarding_wizard.
 * JSONB fields use `Json` (the generic Supabase JSON type) so the
 * auto-generated client doesn't widen to `never`.
 * Use TypedOnboardingWizardRow in application code for strongly-typed access.
 */
export interface TenantOnboardingWizardRow {
  id: string
  tenant_id: string
  mode: string
  status: string
  current_step: number
  answers: Json
  activation_log: Json
  activated_at: string | null
  activated_by: string | null
  created_at: string
  updated_at: string
}

export interface TenantOnboardingWizardInsert {
  tenant_id: string
  id?: string
  mode?: string
  status?: string
  current_step?: number
  answers?: Json
  activation_log?: Json
  activated_at?: string | null
  activated_by?: string | null
}

export type TenantOnboardingWizardUpdate = Partial<TenantOnboardingWizardInsert>

/**
 * Application-layer type for the wizard row.
 * Cast a raw TenantOnboardingWizardRow to this type to access typed JSONB fields.
 */
export interface TypedOnboardingWizardRow {
  id: string
  tenant_id: string
  mode: 'draft' | 'default' | 'custom'
  status: 'draft' | 'activated' | 'default_applied'
  current_step: number
  answers: WizardAnswers
  activation_log: ActivationLogEntry[]
  activated_at: string | null
  activated_by: string | null
  created_at: string
  updated_at: string
}

// ── stage_transition_log ─────────────────────────────────────────────────────
// Immutable log of every matter stage change. Populated by the advance-stage
// API route. Written once, never updated.

export interface StageTransitionLogRow {
  id: string
  tenant_id: string
  matter_id: string
  from_stage_id: string | null
  to_stage_id: string | null
  from_stage_name: string | null
  to_stage_name: string | null
  /** 'advance' | 'return_for_correction' | 'override' | 'reassignment' */
  transition_type: string
  override_reason: string | null
  gate_snapshot: Json
  transitioned_by: string | null
  created_at: string
}

export interface StageTransitionLogInsert {
  tenant_id: string
  matter_id: string
  from_stage_id?: string | null
  to_stage_id?: string | null
  from_stage_name?: string | null
  to_stage_name?: string | null
  transition_type?: string
  override_reason?: string | null
  gate_snapshot?: Json
  transitioned_by?: string | null
  id?: string
  created_at?: string
}

// ── matter_risk_flags ────────────────────────────────────────────────────────
// Named risk flags per spec Section 14. 12 flag types with severity levels,
// ownership, and full resolution lifecycle.

export type RiskFlagType =
  | 'PRIOR_REFUSAL'
  | 'STATUS_EXPIRY_IMMINENT'
  | 'INADMISSIBILITY_INDICATOR'
  | 'SPOUSE_NON_ACCOMPANYING_INCONSISTENCY'
  | 'DEPENDENT_AGEOUT_RISK'
  | 'TRAVEL_HISTORY_GAP'
  | 'EMPLOYMENT_INCONSISTENCY'
  | 'FUNDS_CONCERN'
  | 'MISSING_TRANSLATION'
  | 'UNSIGNED_DECLARATION'
  | 'PRIOR_REPRESENTATIVE_MISMATCH'
  | 'DUPLICATE_APPLICANT_IDENTIFIER'

export type RiskFlagSeverity = 'low' | 'advisory' | 'elevated' | 'critical'
export type RiskFlagStatus = 'open' | 'acknowledged' | 'resolved' | 'overridden'

export interface MatterRiskFlagRow {
  id: string
  tenant_id: string
  matter_id: string
  flag_type: string
  severity: RiskFlagSeverity
  auto_detected: boolean | null
  detected_at: string
  detected_by: string
  status: RiskFlagStatus
  resolution_note: string | null
  resolved_by: string | null
  resolved_at: string | null
  override_reason: string | null
  /** Structured evidence captured by the auto-detection engine. */
  evidence: Json | null
  /** Human-readable suggested remediation action from the auto-detection engine. */
  suggested_action: string | null
  created_at: string
  updated_at: string
}

export interface MatterRiskFlagInsert {
  tenant_id: string
  matter_id: string
  flag_type: string
  severity?: RiskFlagSeverity
  auto_detected?: boolean | null
  detected_by?: string
  status?: RiskFlagStatus
  resolution_note?: string | null
  resolved_by?: string | null
  resolved_at?: string | null
  override_reason?: string | null
  evidence?: Json | null
  suggested_action?: string | null
  id?: string
  detected_at?: string
  created_at?: string
  updated_at?: string
}

export type MatterRiskFlagUpdate = Partial<
  Pick<MatterRiskFlagRow, 'status' | 'resolution_note' | 'resolved_by' | 'resolved_at' | 'override_reason' | 'severity' | 'evidence' | 'suggested_action'>
>

// ── Document Engine Row Aliases ───────────────────────────────────────────────
// Convenience aliases so document-engine.ts and consumers can import named types
// instead of deeply nested Database['public']['Tables']['...']['Row'] paths.

export type DocumentTemplateRow         = Database['public']['Tables']['document_templates']['Row']
export type DocumentTemplateInsert      = Database['public']['Tables']['document_templates']['Insert']
export type DocumentTemplateUpdate      = Database['public']['Tables']['document_templates']['Update']

export type DocumentTemplateVersionRow    = Database['public']['Tables']['document_template_versions']['Row']
export type DocumentTemplateVersionInsert = Database['public']['Tables']['document_template_versions']['Insert']
export type DocumentTemplateVersionUpdate = Database['public']['Tables']['document_template_versions']['Update']

export type DocumentTemplateMappingRow    = Database['public']['Tables']['document_template_mappings']['Row']
export type DocumentTemplateMappingInsert = Database['public']['Tables']['document_template_mappings']['Insert']
export type DocumentTemplateMappingUpdate = Database['public']['Tables']['document_template_mappings']['Update']

export type DocumentTemplateConditionRow    = Database['public']['Tables']['document_template_conditions']['Row']
export type DocumentTemplateConditionInsert = Database['public']['Tables']['document_template_conditions']['Insert']
export type DocumentTemplateConditionUpdate = Database['public']['Tables']['document_template_conditions']['Update']

export type DocumentClauseAssignmentRow    = Database['public']['Tables']['document_clause_assignments']['Row']
export type DocumentClauseAssignmentInsert = Database['public']['Tables']['document_clause_assignments']['Insert']
export type DocumentClauseAssignmentUpdate = Database['public']['Tables']['document_clause_assignments']['Update']

export type DocumentClauseRow    = Database['public']['Tables']['document_clauses']['Row']
export type DocumentClauseInsert = Database['public']['Tables']['document_clauses']['Insert']
export type DocumentClauseUpdate = Database['public']['Tables']['document_clauses']['Update']

export type DocumentInstanceRow    = Database['public']['Tables']['document_instances']['Row']
export type DocumentInstanceInsert = Database['public']['Tables']['document_instances']['Insert']
export type DocumentInstanceUpdate = Database['public']['Tables']['document_instances']['Update']

export type DocumentArtifactRow    = Database['public']['Tables']['document_artifacts']['Row']
export type DocumentArtifactInsert = Database['public']['Tables']['document_artifacts']['Insert']
export type DocumentArtifactUpdate = Database['public']['Tables']['document_artifacts']['Update']

export type DocumentInstanceFieldRow    = Database['public']['Tables']['document_instance_fields']['Row']
export type DocumentInstanceFieldInsert = Database['public']['Tables']['document_instance_fields']['Insert']
export type DocumentInstanceFieldUpdate = Database['public']['Tables']['document_instance_fields']['Update']

export type DocumentStatusEventRow    = Database['public']['Tables']['document_status_events']['Row']
export type DocumentStatusEventInsert = Database['public']['Tables']['document_status_events']['Insert']

export type DocumentSignatureRequestRow    = Database['public']['Tables']['document_signature_requests']['Row']
export type DocumentSignatureRequestInsert = Database['public']['Tables']['document_signature_requests']['Insert']
export type DocumentSignatureRequestUpdate = Database['public']['Tables']['document_signature_requests']['Update']

export type DocumentSignerRow    = Database['public']['Tables']['document_signers']['Row']
export type DocumentSignerInsert = Database['public']['Tables']['document_signers']['Insert']
export type DocumentSignerUpdate = Database['public']['Tables']['document_signers']['Update']

export type DocumentWorkflowRuleRow    = Database['public']['Tables']['document_workflow_rules']['Row']
export type DocumentWorkflowRuleInsert = Database['public']['Tables']['document_workflow_rules']['Insert']
export type DocumentWorkflowRuleUpdate = Database['public']['Tables']['document_workflow_rules']['Update']

// ── Trust Accounting Aliases ───────────────────────────────────────────────
export type TrustBankAccountRow    = Database['public']['Tables']['trust_bank_accounts']['Row']
export type TrustBankAccountInsert = Database['public']['Tables']['trust_bank_accounts']['Insert']
export type TrustBankAccountUpdate = Database['public']['Tables']['trust_bank_accounts']['Update']

export type TrustTransactionRow    = Database['public']['Tables']['trust_transactions']['Row']
export type TrustTransactionInsert = Database['public']['Tables']['trust_transactions']['Insert']
export type TrustTransactionUpdate = Database['public']['Tables']['trust_transactions']['Update']
export type TrustTransactionType   = string
export type TrustPaymentMethod     = string

export type TrustHoldRow    = Database['public']['Tables']['trust_holds']['Row']
export type TrustHoldInsert = Database['public']['Tables']['trust_holds']['Insert']
export type TrustHoldUpdate = Database['public']['Tables']['trust_holds']['Update']

export type TrustDisbursementRequestRow    = Database['public']['Tables']['trust_disbursement_requests']['Row']
export type TrustDisbursementRequestInsert = Database['public']['Tables']['trust_disbursement_requests']['Insert']
export type TrustDisbursementRequestUpdate = Database['public']['Tables']['trust_disbursement_requests']['Update']
export type TrustDisbursementRequestStatus = string
export type TrustDisbursementRequestType   = string

export type TrustReconciliationRow    = Database['public']['Tables']['trust_reconciliations']['Row']
export type TrustReconciliationInsert = Database['public']['Tables']['trust_reconciliations']['Insert']
export type TrustReconciliationUpdate = Database['public']['Tables']['trust_reconciliations']['Update']

export type TrustReconciliationItemRow    = Database['public']['Tables']['trust_reconciliation_items']['Row']
export type TrustReconciliationItemInsert = Database['public']['Tables']['trust_reconciliation_items']['Insert']
export type TrustReconciliationItemUpdate = Database['public']['Tables']['trust_reconciliation_items']['Update']
export type TrustReconciliationItemType   = string

export type TrustAuditLogRow    = Database['public']['Tables']['trust_audit_log']['Row']
export type TrustAuditLogInsert = Database['public']['Tables']['trust_audit_log']['Insert']

// ── trust_ledger_audit (Directive 005  -  immutable balance audit trail) ──────

export interface TrustLedgerAuditRow {
  id: string
  tenant_id: string
  transaction_id: string
  transaction_type: string
  trust_account_id: string
  matter_id: string
  balance_before_cents: number
  amount_cents: number
  balance_after_cents: number
  authorized_by: string
  recorded_by: string
  description: string
  payment_method: string | null
  reference_number: string | null
  reversal_of_id: string | null
  metadata: Json
  content_hash: string
  created_at: string
}

export interface TrustLedgerAuditInsert {
  tenant_id: string
  transaction_id: string
  transaction_type: string
  trust_account_id: string
  matter_id: string
  balance_before_cents: number
  amount_cents: number
  balance_after_cents: number
  authorized_by: string
  recorded_by: string
  description: string
  payment_method?: string | null
  reference_number?: string | null
  reversal_of_id?: string | null
  metadata?: Json
  content_hash: string
}

// ── trust_transaction_log (append-only financial event log) ─────────────────

export type TrustTransactionLogEventType =
  | 'deposit_recorded'
  | 'disbursement_recorded'
  | 'transfer_recorded'
  | 'reversal_recorded'
  | 'hold_created'
  | 'hold_released'
  | 'hold_cancelled'
  | 'reconciliation_created'
  | 'reconciliation_completed'
  | 'reconciliation_reviewed'
  | 'disbursement_request_prepared'
  | 'disbursement_request_approved'
  | 'disbursement_request_rejected'
  | 'balance_warning'
  | 'overdraft_prevented'

export interface TrustTransactionLogRow {
  id: string
  tenant_id: string
  event_type: TrustTransactionLogEventType
  trust_account_id: string | null
  matter_id: string | null
  transaction_id: string | null
  related_entity_type: string | null
  related_entity_id: string | null
  balance_before_cents: number | null
  balance_after_cents: number | null
  amount_cents: number | null
  performed_by: string
  performed_at: string
  description: string
  metadata: Json
  sequence_number: number
  previous_hash: string | null
  entry_hash: string | null
  created_at: string
}

export interface TrustTransactionLogInsert {
  tenant_id: string
  event_type: TrustTransactionLogEventType
  trust_account_id?: string | null
  matter_id?: string | null
  transaction_id?: string | null
  related_entity_type?: string | null
  related_entity_id?: string | null
  balance_before_cents?: number | null
  balance_after_cents?: number | null
  amount_cents?: number | null
  performed_by: string
  description: string
  metadata?: Json
  previous_hash?: string | null
  entry_hash?: string | null
}

export type ChequeRow    = Database['public']['Tables']['cheques']['Row']
export type ChequeInsert = Database['public']['Tables']['cheques']['Insert']
export type ChequeUpdate = Database['public']['Tables']['cheques']['Update']
export type ChequeAccountType = string
export type ChequeStatus      = string

export type OperatingBankAccountRow    = Database['public']['Tables']['operating_bank_accounts']['Row']
export type OperatingBankAccountInsert = Database['public']['Tables']['operating_bank_accounts']['Insert']
export type OperatingBankAccountUpdate = Database['public']['Tables']['operating_bank_accounts']['Update']

// ── Canonical Profile Aliases ──────────────────────────────────────────────
export type CanonicalProfileRow    = Database['public']['Tables']['canonical_profiles']['Row']
export type CanonicalProfileInsert = Database['public']['Tables']['canonical_profiles']['Insert']

export type CanonicalProfileFieldRow    = Database['public']['Tables']['canonical_profile_fields']['Row']
export type CanonicalProfileFieldInsert = Database['public']['Tables']['canonical_profile_fields']['Insert']
export type CanonicalProfileFieldUpdate = Database['public']['Tables']['canonical_profile_fields']['Update']

export type CanonicalProfileSnapshotRow = Database['public']['Tables']['canonical_profile_snapshots']['Row']

export type CanonicalProfileConflictRow = Database['public']['Tables']['canonical_profile_conflicts']['Row']

// ── Activity Feed ────────────────────────────────────────────────────────────
// Manual row type for the activities table used by Zone E activity feed.

export interface ActivityRow {
  id: string
  activity_type: string
  title: string
  description: string | null
  created_at: string | null
  metadata: Json | null
}

// ── Gate Snapshot (stage_transition_log.gate_snapshot shape) ──────────────────
// Typed overlay for the JSON gate evaluation snapshot stored per transition.

export interface GateConditionResult {
  conditionId: string
  conditionName: string
  passed: boolean
  details?: string
}

export interface GateSnapshot {
  evaluatedAt: string
  conditions: GateConditionResult[]
  allPassed: boolean
}

// ── Misc Aliases ───────────────────────────────────────────────────────────
export type AgingBucket = string

// ── Retainer Agreements (migration 116) ────────────────────────────────────
// Manual types  -  not yet in the generated Database union.
// Added here until next type-gen pass after migration 116 is applied.

export interface RetainerAgreementRow {
  id: string
  tenant_id: string
  matter_id: string
  billing_type: string           // 'flat_fee' | 'hourly' | 'contingency' | 'hybrid'
  flat_fee_amount: number | null
  hourly_rate: number | null
  estimated_hours: number | null
  contingency_pct: number | null
  scope_of_services: string | null
  fee_schedule: Json             // { description: string; amount: number; quantity: number }[]
  hst_applicable: boolean
  hst_rate: number
  subtotal_cents: number
  tax_amount_cents: number
  total_amount_cents: number
  signing_method: string         // 'docusign' | 'manual' | 'in_person'
  status: string                 // 'draft' | 'sent_for_signing' | 'signed' | 'voided'
  signed_at: string | null
  sent_at: string | null
  voided_at: string | null
  voided_reason: string | null
  matter_auto_created: boolean
  stage_advanced: boolean
  include_ai_disclosure: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface RetainerAgreementInsert {
  id?: string
  tenant_id: string
  matter_id: string
  billing_type?: string
  flat_fee_amount?: number | null
  hourly_rate?: number | null
  estimated_hours?: number | null
  contingency_pct?: number | null
  scope_of_services?: string | null
  fee_schedule?: Json
  hst_applicable?: boolean
  hst_rate?: number
  subtotal_cents?: number
  tax_amount_cents?: number
  total_amount_cents?: number
  signing_method?: string
  status?: string
  signed_at?: string | null
  sent_at?: string | null
  voided_at?: string | null
  voided_reason?: string | null
  matter_auto_created?: boolean
  stage_advanced?: boolean
  include_ai_disclosure?: boolean
  created_by?: string | null
  updated_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface RetainerAgreementUpdate {
  billing_type?: string
  flat_fee_amount?: number | null
  hourly_rate?: number | null
  estimated_hours?: number | null
  contingency_pct?: number | null
  scope_of_services?: string | null
  fee_schedule?: Json
  hst_applicable?: boolean
  hst_rate?: number
  subtotal_cents?: number
  tax_amount_cents?: number
  total_amount_cents?: number
  signing_method?: string
  status?: string
  signed_at?: string | null
  sent_at?: string | null
  voided_at?: string | null
  voided_reason?: string | null
  matter_auto_created?: boolean
  stage_advanced?: boolean
  include_ai_disclosure?: boolean
  updated_by?: string | null
  updated_at?: string
}

// ── ircc_correspondence ────────────────────────────────────────────────────────

export interface IrccCorrespondenceRow {
  id: string
  tenant_id: string
  matter_id: string
  item_type: string
  item_date: string | null
  status: string
  decision_type: string | null
  notes: string | null
  document_path: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface IrccCorrespondenceInsert {
  id?: string
  tenant_id: string
  matter_id: string
  item_type: string
  item_date?: string | null
  status?: string
  decision_type?: string | null
  notes?: string | null
  document_path?: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface IrccCorrespondenceUpdate {
  item_type?: string
  item_date?: string | null
  status?: string
  decision_type?: string | null
  notes?: string | null
  document_path?: string | null
  updated_at?: string
}

// ── matter_sla_tracking ───────────────────────────────────────────────────────

export interface MatterSLATrackingRow {
  id: string
  tenant_id: string
  matter_id: string
  sla_class: string
  started_at: string
  due_at: string
  breached_at: string | null
  status: string
  completed_at: string | null
  context_ref: string | null
  created_by: string | null
  created_at: string
}

export interface MatterSLATrackingInsert {
  id?: string
  tenant_id: string
  matter_id: string
  sla_class: string
  started_at?: string
  due_at: string
  breached_at?: string | null
  status?: string
  completed_at?: string | null
  context_ref?: string | null
  created_by?: string | null
  created_at?: string
}

export interface MatterSLATrackingUpdate {
  sla_class?: string
  started_at?: string
  due_at?: string
  breached_at?: string | null
  status?: string
  completed_at?: string | null
  context_ref?: string | null
}

// ── matter_billing_milestones ──────────────────────────────────────────────────

export interface MatterBillingMilestoneRow {
  id: string
  tenant_id: string
  matter_id: string
  name: string
  amount_cents: number
  due_date: string | null
  status: string
  completed_at: string | null
  billed_at: string | null
  invoice_id: string | null
  sort_order: number
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface MatterBillingMilestoneInsert {
  id?: string
  tenant_id: string
  matter_id: string
  name: string
  amount_cents?: number
  due_date?: string | null
  status?: string
  completed_at?: string | null
  billed_at?: string | null
  invoice_id?: string | null
  sort_order?: number
  notes?: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface MatterBillingMilestoneUpdate {
  name?: string
  amount_cents?: number
  due_date?: string | null
  status?: string
  completed_at?: string | null
  billed_at?: string | null
  invoice_id?: string | null
  sort_order?: number
  notes?: string | null
  updated_at?: string
}

// ── lead_outcomes ──────────────────────────────────────────────────────────────

export type LeadOutcome =
  | 'RETAIN'
  | 'FOLLOW_UP'
  | 'NOT_QUALIFIED'
  | 'REFERRED_OUT'
  | 'NO_SHOW'
  | 'DECLINED'
  | 'DUPLICATE'

export interface LeadOutcomeRow {
  id: string
  tenant_id: string
  lead_id: string
  outcome: LeadOutcome
  outcome_at: string
  notes: string | null
  follow_up_date: string | null
  referral_target: string | null
  duplicate_of: string | null
  actioned_by: string | null
  created_at: string
}

export interface LeadOutcomeInsert {
  id?: string
  tenant_id: string
  lead_id: string
  outcome: LeadOutcome
  outcome_at?: string
  notes?: string | null
  follow_up_date?: string | null
  referral_target?: string | null
  duplicate_of?: string | null
  actioned_by?: string | null
  created_at?: string
}

// ── contact_relationships  -  convenience aliases ─────────────────────────────
// The table uses contact_id_a / contact_id_b (original schema from migration 001).
// These aliases expose the Database row/insert types under predictable names.
export type ContactRelationshipRow    = Database['public']['Tables']['contact_relationships']['Row']
export type ContactRelationshipInsert = Database['public']['Tables']['contact_relationships']['Insert']
export type ContactRelationshipUpdate = Database['public']['Tables']['contact_relationships']['Update']

// ── matter_rule_snapshots ─────────────────────────────────────────────────────
export type RuleType = 'matter_type_config' | 'sla_config' | 'billing_config' | 'document_checklist' | 'task_templates' | 'form_pack_config'

export interface MatterRuleSnapshotRow {
  id: string
  tenant_id: string
  matter_id: string
  rule_type: RuleType
  snapshot_data: Record<string, unknown>
  version_hash: string
  captured_at: string
}

export interface MatterRuleSnapshotInsert {
  id?: string
  tenant_id: string
  matter_id: string
  rule_type: RuleType
  snapshot_data: Record<string, unknown>
  version_hash: string
  captured_at?: string
}

// ── Onboarding Wizard  -  7-step simplified wizard types (Agent 2 additions) ────
// Lines 19914–19963 added 2026-03-17 by the onboarding wizard agent.
// These supplement the existing WizardAnswers / TenantOnboardingWizardRow types
// and add types specific to the simplified 7-step onboarding flow.

/** Practice area keys accepted by the 7-step onboarding wizard. */
export type OnboardingPracticeArea =
  | 'Immigration'
  | 'Real Estate'
  | 'Family Law'
  | 'Corporate'
  | 'Wills & Estates'

/** Role options available when inviting team members during onboarding (Step 6). */
export type OnboardingInviteRole =
  | 'lawyer'
  | 'legal_assistant'
  | 'front_desk'
  | 'billing'
  | 'admin'

/** A single team-invite entry collected in Step 6. */
export interface OnboardingInviteEntry {
  email: string
  role:  OnboardingInviteRole
}

/**
 * Request body shape for POST /api/onboarding/apply-setup.
 * Collapses the 7 wizard steps into a single activation payload.
 */
export interface OnboardingApplySetupBody {
  firmName:           string
  logoUrl?:           string | null
  practiceAreas?:     OnboardingPracticeArea[]
  currency?:          'CAD' | 'USD'
  flatFeeDefault?:    number | null
  hourlyRateDefault?: number | null
  primaryColour?:     string
  emailFooter?:       string
  seedMatterTypes?:   boolean
  lawyerFirstName?:   string
  lawyerLastName?:    string
  lawyerEmail?:       string
  lawyerBarNumber?:   string
}

/** Result shape for individual invite attempts in Step 6. */
export interface OnboardingInviteResult {
  email:    string
  ok:       boolean
  skipped?: boolean
  error?:   string
}

// ── readiness score ──────────────────────────────────────────────────────────
export type ReadinessLevel = 'critical' | 'low' | 'medium' | 'high' | 'ready'

export interface ReadinessDomain {
  name: string
  score: number
  weight: number
  weighted: number
  detail: string
}

export interface ReadinessResult {
  total: number
  domains: ReadinessDomain[]
  focus_area: string
  level: ReadinessLevel
}

// ── next action engine ────────────────────────────────────────────────────────
export type EscalationLevel = 'none' | 'amber' | 'red' | 'critical'
export type NextActionType =
  | 'critical_blocker' | 'sla_breach' | 'overdue_task'
  | 'upcoming_deadline' | 'missing_document' | 'pending_review'
  | 'retainer_unsigned' | 'readiness_gap' | 'no_action'

export interface NextAction {
  action_type: NextActionType
  description: string
  due_at: string | null
  owner_role: string
  escalation_level: EscalationLevel
}

// ── matter_deficiencies ───────────────────────────────────────────────────────
// Migration 127  -  Sprint 6, Week 1  -  2026-03-17
// Full deficiency workflow for legal review cycle.

export interface MatterDeficiencyRow {
  id: string
  tenant_id: string
  matter_id: string
  stage_id: string | null
  created_by: string
  assigned_to_user_id: string | null
  severity: 'minor' | 'major' | 'critical'
  category: string
  description: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'reopened'
  reopen_count: number
  chronic_flag: boolean
  resolution_notes: string | null
  resolution_evidence_path: string | null
  resolved_at: string | null
  resolved_by: string | null
  reopened_at: string | null
  reopened_by: string | null
  chronic_escalated_at: string | null
  chronic_escalated_to: string | null
  created_at: string
  updated_at: string
}

export interface MatterDeficiencyInsert {
  id?: string
  tenant_id: string
  matter_id: string
  stage_id?: string | null
  created_by: string
  assigned_to_user_id?: string | null
  severity: 'minor' | 'major' | 'critical'
  category: string
  description: string
  status?: 'open' | 'in_progress' | 'resolved' | 'closed' | 'reopened'
  reopen_count?: number
  chronic_flag?: boolean
  resolution_notes?: string | null
  resolution_evidence_path?: string | null
  resolved_at?: string | null
  resolved_by?: string | null
  reopened_at?: string | null
  reopened_by?: string | null
  chronic_escalated_at?: string | null
  chronic_escalated_to?: string | null
  created_at?: string
  updated_at?: string
}

export interface MatterDeficiencyUpdate {
  stage_id?: string | null
  assigned_to_user_id?: string | null
  severity?: 'minor' | 'major' | 'critical'
  category?: string
  description?: string
  status?: 'open' | 'in_progress' | 'resolved' | 'closed' | 'reopened'
  reopen_count?: number
  chronic_flag?: boolean
  resolution_notes?: string | null
  resolution_evidence_path?: string | null
  resolved_at?: string | null
  resolved_by?: string | null
  reopened_at?: string | null
  reopened_by?: string | null
  chronic_escalated_at?: string | null
  chronic_escalated_to?: string | null
  updated_at?: string
}

// ── refusal_actions (migration 129) ──────────────────────────────────────────

export type RefusalActionType =
  | 'jr_deadline_set'
  | 'urgent_task_created'
  | 'client_notified'
  | 'jr_matter_created'
  | 'reapplication_matter_created'

export interface RefusalActionRow {
  id: string
  tenant_id: string
  correspondence_id: string
  matter_id: string
  action_type: RefusalActionType
  performed_at: string
  performed_by: string | null
  metadata: Json
}

export interface RefusalActionInsert {
  id?: string
  tenant_id: string
  correspondence_id: string
  matter_id: string
  action_type: RefusalActionType
  performed_at?: string
  performed_by?: string | null
  metadata?: Json
}

export interface RefusalActionUpdate {
  metadata?: Json
}

// ── ircc_correspondence: new refusal columns (migration 129) ─────────────────
// Extends IrccCorrespondenceRow / Insert / Update above.
// These are added as a separate augmentation interface because the base
// IrccCorrespondenceRow above is maintained manually and reflects prior state.

export interface IrccCorrespondenceRefusalFields {
  jr_deadline: string | null           // DATE  -  computed JR deadline
  jr_basis: 'inland' | 'outside_canada' | null
  jr_matter_id: string | null          // UUID → matters.id
  reapplication_matter_id: string | null // UUID → matters.id
  client_notified_at: string | null    // TIMESTAMPTZ
  urgent_task_id: string | null        // UUID → tasks.id
}

/** Full ircc_correspondence row including refusal workflow columns */
export interface IrccCorrespondenceRowV2
  extends IrccCorrespondenceRow,
    IrccCorrespondenceRefusalFields {}

/** Insert payload including optional refusal columns */
export interface IrccCorrespondenceInsertV2
  extends IrccCorrespondenceInsert,
    Partial<IrccCorrespondenceRefusalFields> {}

/** Update payload including refusal columns */
export interface IrccCorrespondenceUpdateV2
  extends IrccCorrespondenceUpdate,
    Partial<IrccCorrespondenceRefusalFields> {}

// ── matters: new closure columns (migration 129) ─────────────────────────────

export interface MatterClosureFields {
  closed_reason: string | null
  closed_by: string | null      // UUID → users.id
  closed_at: string | null      // TIMESTAMPTZ
}

// ── matter_intake: new submission confirmation columns (migration 129) ────────

export interface MatterIntakeSubmissionFields {
  submission_confirmation_number: string | null
  submission_confirmation_doc_path: string | null
  submission_confirmed_at: string | null      // TIMESTAMPTZ
  submission_confirmed_by: string | null      // UUID → users.id
}

// ── form_generation_log (migration 130) ──────────────────────────────────────
// Audit log for every PDF form generation job dispatched to the Python sidecar.

export type FormGenerationStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface FormGenerationLogRow {
  id: string
  tenant_id: string
  matter_id: string
  form_template_id: string
  generation_key: string
  status: FormGenerationStatus
  output_path: string | null
  error_message: string | null
  page_count: number | null
  processing_started_at: string | null
  completed_at: string | null
  requested_by: string | null
  metadata: Json
  created_at: string
  updated_at: string
}

export interface FormGenerationLogInsert {
  id?: string
  tenant_id: string
  matter_id: string
  form_template_id: string
  generation_key?: string
  status?: FormGenerationStatus
  output_path?: string | null
  error_message?: string | null
  page_count?: number | null
  processing_started_at?: string | null
  completed_at?: string | null
  requested_by?: string | null
  metadata?: Json
  created_at?: string
  updated_at?: string
}

export interface FormGenerationLogUpdate {
  status?: FormGenerationStatus
  output_path?: string | null
  error_message?: string | null
  page_count?: number | null
  processing_started_at?: string | null
  completed_at?: string | null
  metadata?: Json
  updated_at?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// Migration 145: IRCC Forms Engine  -  Core Infrastructure
// ═══════════════════════════════════════════════════════════════════════════════

// ── matter_form_instances: new forms-engine columns ─────────────────────────

export interface MatterFormInstanceEngineFields {
  answers: Json                        // JSONB, per-instance answer storage
  completion_state: Json               // JSONB, section-level completion tracking
  blocker_count: number                // blocking validation failures
  stale_count: number                  // stale dependency count
  missing_required_count: number       // required fields still empty
  last_prefill_at: string | null       // TIMESTAMPTZ
  prefill_source: string | null        // e.g. 'canonical_prefill', 'cross_form_reuse'
}

// ── ircc_form_fields: new forms-engine columns ──────────────────────────────

export interface IrccFormFieldEngineFields {
  on_parent_change: 'mark_stale' | 'auto_clear'
  propagation_mode: 'auto' | 'no_propagate'
  min_length: number | null
  validation_pattern: string | null
  validation_message: string | null
  is_blocking: boolean
  canonical_domain: string | null
}

// ── ircc_form_sections: new forms-engine columns ────────────────────────────

export interface IrccFormSectionEngineFields {
  completion_condition: Json | null    // JSONB rule for section completion
  is_repeatable: boolean
}

// ── form_instance_answer_history (append-only audit) ────────────────────────

export type AnswerHistorySource =
  | 'client_portal'
  | 'staff_entry'
  | 'canonical_prefill'
  | 'cross_form_reuse'
  | 'cross_matter_import'
  | 'extraction'
  | 'migration'

export interface FormInstanceAnswerHistoryRow {
  id: string
  tenant_id: string
  form_instance_id: string
  profile_path: string
  old_value: Json | null
  new_value: Json | null
  source: AnswerHistorySource
  source_origin: string | null
  changed_by: string | null            // UUID → users.id
  changed_at: string                   // TIMESTAMPTZ
  stale_triggered: boolean
}

export interface FormInstanceAnswerHistoryInsert {
  id?: string
  tenant_id: string
  form_instance_id: string
  profile_path: string
  old_value?: Json | null
  new_value?: Json | null
  source: AnswerHistorySource
  source_origin?: string | null
  changed_by?: string | null
  changed_at?: string
  stale_triggered?: boolean
}

// No Update type  -  table is append-only (no UPDATE/DELETE allowed by RLS)

// ── reuse_log ───────────────────────────────────────────────────────────────

export type ReuseType = 'cross_form' | 'cross_matter' | 'canonical_prefill'

export interface ReuseLogRow {
  id: string
  tenant_id: string
  reuse_type: ReuseType
  target_instance_id: string
  target_profile_path: string
  source_instance_id: string | null
  source_matter_id: string | null
  source_canonical_field_id: string | null
  value: Json
  accepted: boolean | null
  accepted_by: string | null           // UUID → users.id
  accepted_at: string | null           // TIMESTAMPTZ
  created_at: string
}

export interface ReuseLogInsert {
  id?: string
  tenant_id: string
  reuse_type: ReuseType
  target_instance_id: string
  target_profile_path: string
  source_instance_id?: string | null
  source_matter_id?: string | null
  source_canonical_field_id?: string | null
  value: Json
  accepted?: boolean | null
  accepted_by?: string | null
  accepted_at?: string | null
  created_at?: string
}

// No Update type  -  table is append-only (no UPDATE/DELETE allowed by RLS)

// ── composite_validation_rules ──────────────────────────────────────────────

export type CompositeRuleSeverity = 'blocking' | 'warning'
export type CompositeRuleScope = 'form' | 'matter' | 'entity'

export interface CompositeValidationRuleRow {
  id: string
  tenant_id: string
  form_id: string | null               // UUID → ircc_forms.id (null = global rule)
  rule_key: string
  description: string
  severity: CompositeRuleSeverity
  scope: CompositeRuleScope
  condition: Json                      // JSONB rule definition
  field_paths: string[]
  error_message: string
  error_message_staff: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CompositeValidationRuleInsert {
  id?: string
  tenant_id: string
  form_id?: string | null
  rule_key: string
  description: string
  severity?: CompositeRuleSeverity
  scope?: CompositeRuleScope
  condition: Json
  field_paths: string[]
  error_message: string
  error_message_staff?: string | null
  is_active?: boolean
  sort_order?: number
  created_at?: string
  updated_at?: string
}

export interface CompositeValidationRuleUpdate {
  rule_key?: string
  description?: string
  severity?: CompositeRuleSeverity
  scope?: CompositeRuleScope
  condition?: Json
  field_paths?: string[]
  error_message?: string
  error_message_staff?: string | null
  is_active?: boolean
  sort_order?: number
  updated_at?: string
}

// ── Wiki Knowledge Base ─────────────────────────────────────────────────────

export type WikiPlaybookStatus = 'draft' | 'published' | 'archived'
export type WikiSnippetType = 'email' | 'clause' | 'template' | 'note'

export interface WikiBlockContent {
  id: string
  type: 'heading' | 'paragraph' | 'checklist' | 'callout' | 'divider' | 'code' | 'quote'
  content: string
  checked?: boolean
  level?: number
  variant?: string
}

export interface WikiCategoryRow {
  id: string
  tenant_id: string
  name: string
  slug: string
  description: string | null
  color: string
  icon: string
  sort_order: number
  is_active: boolean
  created_at: string
  created_by: string | null
}

export interface WikiCategoryInsert {
  id?: string
  tenant_id: string
  name: string
  slug: string
  description?: string | null
  color?: string
  icon?: string
  sort_order?: number
  is_active?: boolean
}

export interface WikiCategoryUpdate {
  name?: string
  slug?: string
  description?: string | null
  color?: string
  icon?: string
  sort_order?: number
  is_active?: boolean
}

export interface WikiPlaybookRow {
  id: string
  tenant_id: string
  category_id: string | null
  title: string
  slug: string
  description: string | null
  content: Json
  tags: string[]
  status: WikiPlaybookStatus
  is_pinned: boolean
  version_number: number
  practice_area_id: string | null
  matter_type_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface WikiPlaybookInsert {
  id?: string
  tenant_id: string
  category_id?: string | null
  title: string
  slug: string
  description?: string | null
  content?: Json
  tags?: string[]
  status?: WikiPlaybookStatus
  is_pinned?: boolean
  version_number?: number
  practice_area_id?: string | null
  matter_type_id?: string | null
}

export interface WikiPlaybookUpdate {
  category_id?: string | null
  title?: string
  slug?: string
  description?: string | null
  content?: Json
  tags?: string[]
  status?: WikiPlaybookStatus
  is_pinned?: boolean
  version_number?: number
  practice_area_id?: string | null
  matter_type_id?: string | null
  updated_by?: string | null
}

export interface WikiPlaybookVersionRow {
  id: string
  tenant_id: string
  playbook_id: string
  version_number: number
  title: string
  content: Json
  change_summary: string | null
  created_at: string
  created_by: string | null
}

export interface WikiSnippetRow {
  id: string
  tenant_id: string
  category_id: string | null
  title: string
  content: string
  snippet_type: WikiSnippetType
  tags: string[]
  use_count: number
  is_favourite: boolean
  practice_area_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface WikiSnippetInsert {
  id?: string
  tenant_id: string
  category_id?: string | null
  title: string
  content: string
  snippet_type?: WikiSnippetType
  tags?: string[]
  practice_area_id?: string | null
}

export interface WikiSnippetUpdate {
  category_id?: string | null
  title?: string
  content?: string
  snippet_type?: WikiSnippetType
  tags?: string[]
  is_favourite?: boolean
  practice_area_id?: string | null
  updated_by?: string | null
}

export interface WikiSearchResult {
  id: string
  item_type: 'playbook' | 'snippet'
  title: string
  description: string | null
  category_name: string | null
  tags: string[]
  status: string
  updated_at: string
  rank: number
}

// ── Norva Ear Sessions ─────────────────────────────────────────────────────

export type NorvaEarStatus = 'recording' | 'processing' | 'completed' | 'failed'
export type NorvaEarConsentMethod = 'verbal' | 'written' | 'digital' | 'pre_authorized'

export interface NorvaEarSessionRow {
  id: string
  tenant_id: string
  matter_id: string | null
  user_id: string
  title: string | null
  status: NorvaEarStatus
  consent_granted: boolean
  consent_granted_at: string | null
  consent_method: NorvaEarConsentMethod | null
  participants: string[]
  duration_seconds: number | null
  transcript: string | null
  extracted_facts: Json
  anchored_fields: Json
  raw_audio_path: string | null
  created_at: string
  updated_at: string
}

export interface NorvaEarSessionInsert {
  tenant_id: string
  matter_id?: string | null
  user_id: string
  title?: string | null
  status?: NorvaEarStatus
  consent_granted: boolean
  consent_granted_at?: string | null
  consent_method?: NorvaEarConsentMethod | null
  participants?: string[]
  duration_seconds?: number | null
  transcript?: string | null
  extracted_facts?: Json
  anchored_fields?: Json
  raw_audio_path?: string | null
}

// ── IRCC Readability Scans (Audit-Optimizer / Regulator-Mirror) ────────────

export type AuditScanStatus = 'pending' | 'scanning' | 'completed' | 'failed'

export interface AuditScanRow {
  id: string
  tenant_id: string
  matter_id: string
  document_id: string | null
  scanned_by: string
  readability_score: number | null
  keyword_coverage: Json
  structure_issues: Json
  recommendations: Json
  metadata_zones: Json
  status: AuditScanStatus
  error_message: string | null
  created_at: string
}

export interface AuditScanInsert {
  tenant_id: string
  matter_id: string
  document_id?: string | null
  scanned_by: string
  readability_score?: number | null
  keyword_coverage?: Json
  structure_issues?: Json
  recommendations?: Json
  metadata_zones?: Json
  status?: AuditScanStatus
  error_message?: string | null
}

// ── Case Law Alerts (Drift Sentry) ─────────────────────────────────────────

export type CaseLawAlertType = 'case_law_change' | 'policy_update' | 'regulation_change'
export type CaseLawAlertStatus = 'new' | 'reviewed' | 'actioned' | 'dismissed'

export interface CaseLawAlertRow {
  id: string
  tenant_id: string
  alert_type: CaseLawAlertType
  title: string
  summary: string | null
  source_url: string | null
  source_citation: string | null
  court: string | null
  jurisdiction: string | null
  practice_area_id: string | null
  keywords: string[]
  relevance_score: number | null
  status: CaseLawAlertStatus
  reviewed_by: string | null
  reviewed_at: string | null
  affected_matter_ids: string[]
  raw_data: Json
  decision_date: string | null
  acknowledged_at: string | null
  acknowledged_by: string | null
  created_at: string
}

export interface CaseLawAlertInsert {
  tenant_id: string
  alert_type?: CaseLawAlertType
  title: string
  summary?: string | null
  source_url?: string | null
  source_citation?: string | null
  court?: string | null
  jurisdiction?: string | null
  practice_area_id?: string | null
  keywords?: string[]
  relevance_score?: number | null
  status?: CaseLawAlertStatus
  affected_matter_ids?: string[]
  raw_data?: Json
  decision_date?: string | null
}

// ── Gold Standard Templates (Success-Reverb) ──────────────────────────────

export interface GoldStandardTemplateRow {
  id: string
  tenant_id: string
  source_matter_id: string
  case_type: string
  matter_type_name: string | null
  readability_score: number | null
  grade: string
  keyword_density: Json
  document_structure: Json
  zone_coverage: Json
  days_to_approval: number | null
  playbook_id: string | null
  playbook_title: string | null
  applicant_redacted: string
  approved_at: string | null
  extracted_by: string | null
  created_at: string
  is_active: boolean
}

export interface GoldStandardTemplateInsert {
  tenant_id: string
  source_matter_id: string
  case_type?: string
  matter_type_name?: string | null
  readability_score?: number | null
  grade?: string
  keyword_density?: Json
  document_structure?: Json
  zone_coverage?: Json
  days_to_approval?: number | null
  playbook_id?: string | null
  playbook_title?: string | null
  applicant_redacted?: string
  approved_at?: string | null
  extracted_by?: string | null
}
