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
      bookings: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          contact_id: string | null
          contact_name: string
          created_at: string
          date: string
          end_hour: number
          end_minute: number
          ghl_event_id: string | null
          guest_count: number
          id: string
          notes: string | null
          preparation_status: string
          requirements: string | null
          reservation_number: string | null
          room_name: string
          room_setup: string | null
          start_hour: number
          start_minute: number
          status: string
          status_reason: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          contact_name?: string
          created_at?: string
          date: string
          end_hour: number
          end_minute?: number
          ghl_event_id?: string | null
          guest_count?: number
          id?: string
          notes?: string | null
          preparation_status?: string
          requirements?: string | null
          reservation_number?: string | null
          room_name: string
          room_setup?: string | null
          start_hour: number
          start_minute?: number
          status?: string
          status_reason?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          contact_name?: string
          created_at?: string
          date?: string
          end_hour?: number
          end_minute?: number
          ghl_event_id?: string | null
          guest_count?: number
          id?: string
          notes?: string | null
          preparation_status?: string
          requirements?: string | null
          reservation_number?: string | null
          room_name?: string
          room_setup?: string | null
          start_hour?: number
          start_minute?: number
          status?: string
          status_reason?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          btw_number: string | null
          city: string | null
          country: string | null
          created_at: string
          crm_group: string | null
          customer_number: string | null
          display_number: string | null
          email: string | null
          ghl_company_id: string | null
          id: string
          kvk: string | null
          last_local_edit_at: string | null
          last_sync_error: string | null
          last_synced_at: string | null
          name: string
          notes: string | null
          pending_outbound_sync: boolean
          phone: string | null
          postcode: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          btw_number?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          crm_group?: string | null
          customer_number?: string | null
          display_number?: string | null
          email?: string | null
          ghl_company_id?: string | null
          id?: string
          kvk?: string | null
          last_local_edit_at?: string | null
          last_sync_error?: string | null
          last_synced_at?: string | null
          name: string
          notes?: string | null
          pending_outbound_sync?: boolean
          phone?: string | null
          postcode?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          btw_number?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          crm_group?: string | null
          customer_number?: string | null
          display_number?: string | null
          email?: string | null
          ghl_company_id?: string | null
          id?: string
          kvk?: string | null
          last_local_edit_at?: string | null
          last_sync_error?: string | null
          last_synced_at?: string | null
          name?: string
          notes?: string | null
          pending_outbound_sync?: boolean
          phone?: string | null
          postcode?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      contact_activities: {
        Row: {
          body: string | null
          contact_id: string
          created_at: string
          ghl_note_id: string | null
          id: string
          related_task_id: string | null
          subject: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          contact_id: string
          created_at?: string
          ghl_note_id?: string | null
          id?: string
          related_task_id?: string | null
          subject?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          contact_id?: string
          created_at?: string
          ghl_note_id?: string | null
          id?: string
          related_task_id?: string | null
          subject?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_companies: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          id: string
          is_primary: boolean
          user_id: string
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id: string
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_companies_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          birth_date: string | null
          city: string | null
          company: string | null
          company_id: string | null
          country: string | null
          created_at: string
          departed: boolean
          department: string | null
          display_number: string | null
          dmu: string | null
          email: string | null
          first_name: string
          function_group: string | null
          ghl_contact_id: string | null
          id: string
          job_title: string | null
          last_local_edit_at: string | null
          last_name: string
          last_sync_error: string | null
          last_synced_at: string | null
          notes: string | null
          pending_outbound_sync: boolean
          phone: string | null
          postcode: string | null
          status: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          company?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          departed?: boolean
          department?: string | null
          display_number?: string | null
          dmu?: string | null
          email?: string | null
          first_name: string
          function_group?: string | null
          ghl_contact_id?: string | null
          id?: string
          job_title?: string | null
          last_local_edit_at?: string | null
          last_name: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          notes?: string | null
          pending_outbound_sync?: boolean
          phone?: string | null
          postcode?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          company?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          departed?: boolean
          department?: string | null
          display_number?: string | null
          dmu?: string | null
          email?: string | null
          first_name?: string
          function_group?: string | null
          ghl_contact_id?: string | null
          id?: string
          job_title?: string | null
          last_local_edit_at?: string | null
          last_name?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          notes?: string | null
          pending_outbound_sync?: boolean
          phone?: string | null
          postcode?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          channel: string | null
          contact_id: string | null
          contact_name: string
          created_at: string
          email: string | null
          ghl_conversation_id: string | null
          id: string
          last_message_body: string | null
          last_message_date: string | null
          last_message_direction: string | null
          phone: string | null
          unread: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string | null
          contact_id?: string | null
          contact_name?: string
          created_at?: string
          email?: string | null
          ghl_conversation_id?: string | null
          id?: string
          last_message_body?: string | null
          last_message_date?: string | null
          last_message_direction?: string | null
          phone?: string | null
          unread?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string | null
          contact_id?: string | null
          contact_name?: string
          created_at?: string
          email?: string | null
          ghl_conversation_id?: string | null
          id?: string
          last_message_body?: string | null
          last_message_date?: string | null
          last_message_direction?: string | null
          phone?: string | null
          unread?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          amount: number | null
          company_id: string | null
          contact_id: string | null
          contact_name: string
          created_at: string
          document_type: string
          external_url: string | null
          ghl_document_id: string | null
          id: string
          inquiry_id: string | null
          sent_at: string
          signed_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          amount?: number | null
          company_id?: string | null
          contact_id?: string | null
          contact_name?: string
          created_at?: string
          document_type?: string
          external_url?: string | null
          ghl_document_id?: string | null
          id?: string
          inquiry_id?: string | null
          sent_at?: string
          signed_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          amount?: number | null
          company_id?: string | null
          contact_id?: string | null
          contact_name?: string
          created_at?: string
          document_type?: string
          external_url?: string | null
          ghl_document_id?: string | null
          id?: string
          inquiry_id?: string | null
          sent_at?: string
          signed_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          assigned_to: string | null
          budget: number | null
          company_id: string | null
          contact_id: string | null
          contact_name: string
          created_at: string
          display_number: string | null
          event_type: string
          ghl_opportunity_id: string | null
          guest_count: number
          id: string
          is_read: boolean
          message: string | null
          preferred_date: string | null
          preferred_end_time: string | null
          preferred_start_time: string | null
          room_preference: string | null
          source: string
          status: string
          status_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          budget?: number | null
          company_id?: string | null
          contact_id?: string | null
          contact_name: string
          created_at?: string
          display_number?: string | null
          event_type: string
          ghl_opportunity_id?: string | null
          guest_count?: number
          id?: string
          is_read?: boolean
          message?: string | null
          preferred_date?: string | null
          preferred_end_time?: string | null
          preferred_start_time?: string | null
          room_preference?: string | null
          source?: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          budget?: number | null
          company_id?: string | null
          contact_id?: string | null
          contact_name?: string
          created_at?: string
          display_number?: string | null
          event_type?: string
          ghl_opportunity_id?: string | null
          guest_count?: number
          id?: string
          is_read?: boolean
          message?: string | null
          preferred_date?: string | null
          preferred_end_time?: string | null
          preferred_start_time?: string | null
          room_preference?: string | null
          source?: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          description: string | null
          discount_percent: number
          id: string
          invoice_id: string
          item_name: string
          ledger_account: string | null
          line_total: number
          quantity: number
          sort_order: number
          unit_price: number
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          invoice_id: string
          item_name: string
          ledger_account?: string | null
          line_total?: number
          quantity?: number
          sort_order?: number
          unit_price?: number
          vat_rate?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          invoice_id?: string
          item_name?: string
          ledger_account?: string | null
          line_total?: number
          quantity?: number
          sort_order?: number
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_address: string | null
          client_email: string | null
          company_id: string | null
          company_name: string | null
          contact_id: string | null
          contact_name: string
          created_at: string
          discount_amount: number
          display_number: string | null
          due_date: string | null
          eboekhouden_mutation_id: string | null
          ghl_invoice_id: string | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          quote_id: string | null
          sent_at: string | null
          status: string
          stripe_invoice_id: string | null
          stripe_payment_link: string | null
          subtotal: number
          title: string
          total: number
          updated_at: string
          user_id: string
          vat_amount: number
        }
        Insert: {
          client_address?: string | null
          client_email?: string | null
          company_id?: string | null
          company_name?: string | null
          contact_id?: string | null
          contact_name?: string
          created_at?: string
          discount_amount?: number
          display_number?: string | null
          due_date?: string | null
          eboekhouden_mutation_id?: string | null
          ghl_invoice_id?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          quote_id?: string | null
          sent_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_link?: string | null
          subtotal?: number
          title?: string
          total?: number
          updated_at?: string
          user_id: string
          vat_amount?: number
        }
        Update: {
          client_address?: string | null
          client_email?: string | null
          company_id?: string | null
          company_name?: string | null
          contact_id?: string | null
          contact_name?: string
          created_at?: string
          discount_amount?: number
          display_number?: string | null
          due_date?: string | null
          eboekhouden_mutation_id?: string | null
          ghl_invoice_id?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          quote_id?: string | null
          sent_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_link?: string | null
          subtotal?: number
          title?: string
          total?: number
          updated_at?: string
          user_id?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string | null
          created_at: string
          date_added: string
          direction: string
          ghl_message_id: string | null
          id: string
          message_type: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          body?: string
          conversation_id?: string | null
          created_at?: string
          date_added?: string
          direction?: string
          ghl_message_id?: string | null
          id?: string
          message_type?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          body?: string
          conversation_id?: string | null
          created_at?: string
          date_added?: string
          direction?: string
          ghl_message_id?: string | null
          id?: string
          message_type?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          organization_id: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          organization_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_line_items: {
        Row: {
          created_at: string
          description: string | null
          discount_percent: number
          id: string
          item_name: string
          line_total: number
          quantity: number
          quote_id: string
          sort_order: number
          unit_price: number
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          item_name: string
          line_total?: number
          quantity?: number
          quote_id: string
          sort_order?: number
          unit_price?: number
          vat_rate?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          item_name?: string
          line_total?: number
          quantity?: number
          quote_id?: string
          sort_order?: number
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_templates: {
        Row: {
          content_blocks: Json
          created_at: string
          default_line_items: Json | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          terms_and_conditions: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content_blocks?: Json
          created_at?: string
          default_line_items?: Json | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          terms_and_conditions?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content_blocks?: Json
          created_at?: string
          default_line_items?: Json | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          terms_and_conditions?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          accepted_at: string | null
          client_address: string | null
          client_email: string | null
          company_id: string | null
          company_name: string | null
          contact_id: string | null
          contact_name: string
          content_blocks: Json | null
          created_at: string
          declined_at: string | null
          discount_amount: number
          display_number: string | null
          ghl_document_id: string | null
          ghl_opportunity_id: string | null
          id: string
          introduction: string | null
          last_sent_at: string | null
          last_sent_to: string | null
          notes: string | null
          overlay_fields: Json | null
          pdf_url: string | null
          public_token: string | null
          sent_at: string | null
          signature_data: string | null
          signature_ip: string | null
          signed_pdf_url: string | null
          status: string
          subtotal: number
          template_id: string | null
          terms_and_conditions: string | null
          title: string
          total: number
          updated_at: string
          user_id: string
          valid_until: string | null
          vat_amount: number
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_address?: string | null
          client_email?: string | null
          company_id?: string | null
          company_name?: string | null
          contact_id?: string | null
          contact_name?: string
          content_blocks?: Json | null
          created_at?: string
          declined_at?: string | null
          discount_amount?: number
          display_number?: string | null
          ghl_document_id?: string | null
          ghl_opportunity_id?: string | null
          id?: string
          introduction?: string | null
          last_sent_at?: string | null
          last_sent_to?: string | null
          notes?: string | null
          overlay_fields?: Json | null
          pdf_url?: string | null
          public_token?: string | null
          sent_at?: string | null
          signature_data?: string | null
          signature_ip?: string | null
          signed_pdf_url?: string | null
          status?: string
          subtotal?: number
          template_id?: string | null
          terms_and_conditions?: string | null
          title?: string
          total?: number
          updated_at?: string
          user_id: string
          valid_until?: string | null
          vat_amount?: number
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_address?: string | null
          client_email?: string | null
          company_id?: string | null
          company_name?: string | null
          contact_id?: string | null
          contact_name?: string
          content_blocks?: Json | null
          created_at?: string
          declined_at?: string | null
          discount_amount?: number
          display_number?: string | null
          ghl_document_id?: string | null
          ghl_opportunity_id?: string | null
          id?: string
          introduction?: string | null
          last_sent_at?: string | null
          last_sent_to?: string | null
          notes?: string | null
          overlay_fields?: Json | null
          pdf_url?: string | null
          public_token?: string | null
          sent_at?: string | null
          signature_data?: string | null
          signature_ip?: string | null
          signed_pdf_url?: string | null
          status?: string
          subtotal?: number
          template_id?: string | null
          terms_and_conditions?: string | null
          title?: string
          total?: number
          updated_at?: string
          user_id?: string
          valid_until?: string | null
          vat_amount?: number
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      room_conflict_rules: {
        Row: {
          conflicts_with: string
          created_at: string
          id: string
          room_name: string
        }
        Insert: {
          conflicts_with: string
          created_at?: string
          id?: string
          room_name: string
        }
        Update: {
          conflicts_with?: string
          created_at?: string
          id?: string
          room_name?: string
        }
        Relationships: []
      }
      room_settings: {
        Row: {
          created_at: string
          display_name: string | null
          enabled: boolean
          ghl_calendar_id: string | null
          id: string
          max_guests: number
          room_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          enabled?: boolean
          ghl_calendar_id?: string | null
          id?: string
          max_guests?: number
          room_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          enabled?: boolean
          ghl_calendar_id?: string | null
          id?: string
          max_guests?: number
          room_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          action_type: string
          completed_at: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          max_retries: number
          payload: Json | null
          retry_count: number
          status: string
          user_id: string
        }
        Insert: {
          action_type: string
          completed_at?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_retries?: number
          payload?: Json | null
          retry_count?: number
          status?: string
          user_id: string
        }
        Update: {
          action_type?: string
          completed_at?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_retries?: number
          payload?: Json | null
          retry_count?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          booking_id: string | null
          company_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          due_time: string | null
          ghl_task_id: string | null
          id: string
          inquiry_id: string | null
          legacy_task_id: number | null
          priority: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          booking_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          ghl_task_id?: string | null
          id?: string
          inquiry_id?: string | null
          legacy_task_id?: number | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          booking_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          ghl_task_id?: string | null
          id?: string
          inquiry_id?: string | null
          legacy_task_id?: number | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_public_quote: { Args: { _token: string }; Returns: Json }
      normalize_dutch_name_particles: {
        Args: { input_text: string }
        Returns: string
      }
      public_quote_mark_viewed: { Args: { _token: string }; Returns: undefined }
      public_quote_respond: {
        Args: {
          _action: string
          _ip: string
          _signature: string
          _token: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "team_member"
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
      app_role: ["admin", "team_member"],
    },
  },
} as const
