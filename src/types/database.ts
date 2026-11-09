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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      listings: {
        Row: {
          canonical_url: string
          created_at: string
          created_by: string | null
          id: string
          portal: string | null
          url: string
        }
        Insert: {
          canonical_url: string
          created_at?: string
          created_by?: string | null
          id?: string
          portal?: string | null
          url: string
        }
        Update: {
          canonical_url?: string
          created_at?: string
          created_by?: string | null
          id?: string
          portal?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          locale: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          locale?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          locale?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      trip_listings: {
        Row: {
          agent_email: string | null
          agent_name: string | null
          agent_phone: string | null
          approx_lat: number
          approx_lng: number
          approx_radius_m: number
          buyer_notes: string | null
          comune_istat: string
          comune_name: string
          created_at: string
          dwell_minutes: number | null
          given_address: string | null
          given_lat: number | null
          given_lng: number | null
          id: string
          listing_id: string
          priority: number
          rating: number | null
          status: Database["public"]["Enums"]["trip_listing_status"]
          trip_id: string
          updated_at: string
        }
        Insert: {
          agent_email?: string | null
          agent_name?: string | null
          agent_phone?: string | null
          approx_lat: number
          approx_lng: number
          approx_radius_m: number
          buyer_notes?: string | null
          comune_istat: string
          comune_name: string
          created_at?: string
          dwell_minutes?: number | null
          given_address?: string | null
          given_lat?: number | null
          given_lng?: number | null
          id?: string
          listing_id: string
          priority?: number
          rating?: number | null
          status?: Database["public"]["Enums"]["trip_listing_status"]
          trip_id: string
          updated_at?: string
        }
        Update: {
          agent_email?: string | null
          agent_name?: string | null
          agent_phone?: string | null
          approx_lat?: number
          approx_lng?: number
          approx_radius_m?: number
          buyer_notes?: string | null
          comune_istat?: string
          comune_name?: string
          created_at?: string
          dwell_minutes?: number | null
          given_address?: string | null
          given_lat?: number | null
          given_lng?: number | null
          id?: string
          listing_id?: string
          priority?: number
          rating?: number | null
          status?: Database["public"]["Enums"]["trip_listing_status"]
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_listings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["trip_member_role"]
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["trip_member_role"]
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["trip_member_role"]
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          default_dwell_minutes: number
          end_date: string
          id: string
          max_drive_minutes_per_day: number
          name: string
          owner_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_dwell_minutes?: number
          end_date: string
          id?: string
          max_drive_minutes_per_day?: number
          name: string
          owner_id?: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_dwell_minutes?: number
          end_date?: string
          id?: string
          max_drive_minutes_per_day?: number
          name?: string
          owner_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          note: string | null
          reason: Database["public"]["Enums"]["credit_reason"]
          stripe_payment_intent: string | null
          trip_listing_id: string | null
          user_id: string
          verification_request_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          note?: string | null
          reason: Database["public"]["Enums"]["credit_reason"]
          stripe_payment_intent?: string | null
          trip_listing_id?: string | null
          user_id: string
          verification_request_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["credit_reason"]
          stripe_payment_intent?: string | null
          trip_listing_id?: string | null
          user_id?: string
          verification_request_id?: string | null
        }
        Relationships: []
      }
      listing_properties: {
        Row: {
          created_at: string
          listing_id: string
          property_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          property_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          property_id?: string
        }
        Relationships: []
      }
      notification_outbox: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          sent_at: string | null
          status: string
          subject: string
          to_email: string
          user_id: string
          verification_request_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind: string
          sent_at?: string | null
          status?: string
          subject: string
          to_email: string
          user_id: string
          verification_request_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          sent_at?: string | null
          status?: string
          subject?: string
          to_email?: string
          user_id?: string
          verification_request_id?: string | null
        }
        Relationships: []
      }
      properties: {
        Row: {
          created_at: string
          id: string
          source: Database["public"]["Enums"]["property_source"]
          verified_at: string
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          source?: Database["public"]["Enums"]["property_source"]
          verified_at?: string
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          source?: Database["public"]["Enums"]["property_source"]
          verified_at?: string
          verified_by?: string | null
        }
        Relationships: []
      }
      property_locations: {
        Row: {
          lat: number
          lng: number
          property_id: string
        }
        Insert: {
          lat: number
          lng: number
          property_id: string
        }
        Update: {
          lat?: number
          lng?: number
          property_id?: string
        }
        Relationships: []
      }
      verification_requests: {
        Row: {
          admin_notes: string | null
          candidates: Json
          created_at: string
          id: string
          listing_id: string
          property_id: string | null
          requested_by: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["verification_status"]
          trip_listing_id: string
        }
        Insert: {
          admin_notes?: string | null
          candidates?: Json
          created_at?: string
          id?: string
          listing_id: string
          property_id?: string | null
          requested_by: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          trip_listing_id: string
        }
        Update: {
          admin_notes?: string | null
          candidates?: Json
          created_at?: string
          id?: string
          listing_id?: string
          property_id?: string | null
          requested_by?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          trip_listing_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_credit_balance: { Args: { p_email: string }; Returns: number }
      admin_properties_near: {
        Args: { p_lat: number; p_listing_id?: string; p_lng: number }
        Returns: Json
      }
      admin_recent_grants: { Args: never; Returns: Json }
      admin_verification_queue: { Args: never; Returns: Json }
      credit_balance: { Args: never; Returns: number }
      ensure_listing: {
        Args: { p_canonical_url: string; p_portal: string; p_url: string }
        Returns: string
      }
      grant_credits: {
        Args: { p_amount: number; p_email: string; p_note?: string }
        Returns: number
      }
      is_admin: { Args: never; Returns: boolean }
      is_trip_member: { Args: { p_trip_id: string }; Returns: boolean }
      is_trip_owner: { Args: { p_trip_id: string }; Returns: boolean }
      request_verification: { Args: { p_trip_listing_id: string }; Returns: string }
      resolve_verification: {
        Args: {
          p_lat?: number
          p_lng?: number
          p_note?: string
          p_outcome: string
          p_property_id?: string
          p_request_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      credit_reason: "purchase" | "unlock" | "refund" | "grant"
      property_source: "ai" | "manual" | "agent"
      trip_listing_status:
        | "approximate"
        | "address_given"
        | "check_requested"
        | "verified"
        | "not_found"
      trip_member_role: "owner" | "partner"
      user_role: "buyer" | "admin"
      verification_status: "queued" | "in_review" | "found" | "not_found"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      credit_reason: ["purchase", "unlock", "refund", "grant"],
      property_source: ["ai", "manual", "agent"],
      trip_listing_status: [
        "approximate",
        "address_given",
        "check_requested",
        "verified",
        "not_found",
      ],
      trip_member_role: ["owner", "partner"],
      user_role: ["buyer", "admin"],
      verification_status: ["queued", "in_review", "found", "not_found"],
    },
  },
} as const
