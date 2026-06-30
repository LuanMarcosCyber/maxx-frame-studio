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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      budget_items: {
        Row: {
          budget_id: string
          created_at: string
          data: Json
          id: string
          position: number
          subtotal: number
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          data?: Json
          id?: string
          position?: number
          subtotal?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          data?: Json
          id?: string
          position?: number
          subtotal?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          client_id: string | null
          client_name: string
          created_at: string
          created_by: string | null
          data_vencimento: string | null
          details: Json
          id: string
          number: string
          status: string
          total_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          client_name: string
          created_at?: string
          created_by?: string | null
          data_vencimento?: string | null
          details?: Json
          id?: string
          number: string
          status?: string
          total_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          data_vencimento?: string | null
          details?: Json
          id?: string
          number?: string
          status?: string
          total_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          address_number: string | null
          cep: string | null
          commercial_phone: string | null
          created_at: string
          customer_type: string
          document: string | null
          email: string | null
          id: string
          mobile_phone: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          cep?: string | null
          commercial_phone?: string | null
          created_at?: string
          customer_type?: string
          document?: string | null
          email?: string | null
          id?: string
          mobile_phone?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          cep?: string | null
          commercial_phone?: string | null
          created_at?: string
          customer_type?: string
          document?: string | null
          email?: string | null
          id?: string
          mobile_phone?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      discount_approval_requests: {
        Row: {
          budget_id: string | null
          budget_number: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          owner_user_id: string
          requested_by: string
          requested_percent: number
          status: string
          updated_at: string
        }
        Insert: {
          budget_id?: string | null
          budget_number?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          owner_user_id: string
          requested_by: string
          requested_percent: number
          status?: string
          updated_at?: string
        }
        Update: {
          budget_id?: string | null
          budget_number?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          owner_user_id?: string
          requested_by?: string
          requested_percent?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_approval_requests_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      number_counters: {
        Row: {
          kind: string
          last_value: number
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          kind: string
          last_value?: number
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          kind?: string
          last_value?: number
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          budget_id: string | null
          client_name: string
          created_at: string
          created_by: string | null
          id: string
          number: string
          status: string
          total_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_id?: string | null
          client_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          number: string
          status?: string
          total_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_id?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          number?: string
          status?: string
          total_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category: string | null
          code: string
          commission_percentage: number
          created_at: string
          description: string
          frame_width_cm: number | null
          id: string
          labor_cost: number
          name: string | null
          ncm: string | null
          profit_margin: number
          supplier: string | null
          updated_at: string
          user_id: string
          value_per_meter: number
          waste_percentage: number
        }
        Insert: {
          barcode?: string | null
          category?: string | null
          code: string
          commission_percentage?: number
          created_at?: string
          description: string
          frame_width_cm?: number | null
          id?: string
          labor_cost?: number
          name?: string | null
          ncm?: string | null
          profit_margin?: number
          supplier?: string | null
          updated_at?: string
          user_id: string
          value_per_meter?: number
          waste_percentage?: number
        }
        Update: {
          barcode?: string | null
          category?: string | null
          code?: string
          commission_percentage?: number
          created_at?: string
          description?: string
          frame_width_cm?: number | null
          id?: string
          labor_cost?: number
          name?: string | null
          ncm?: string | null
          profit_margin?: number
          supplier?: string | null
          updated_at?: string
          user_id?: string
          value_per_meter?: number
          waste_percentage?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          address: string | null
          avatar_url: string | null
          can_create_clients: boolean
          can_create_products: boolean
          can_delete_orders: boolean
          can_edit_budgets: boolean
          created_at: string
          document: string | null
          email: string | null
          full_name: string | null
          id: string
          max_discount_percent: number
          parent_user_id: string | null
          phone: string | null
          store_name: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          avatar_url?: string | null
          can_create_clients?: boolean
          can_create_products?: boolean
          can_delete_orders?: boolean
          can_edit_budgets?: boolean
          created_at?: string
          document?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          max_discount_percent?: number
          parent_user_id?: string | null
          phone?: string | null
          store_name?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          avatar_url?: string | null
          can_create_clients?: boolean
          can_create_products?: boolean
          can_delete_orders?: boolean
          can_edit_budgets?: boolean
          created_at?: string
          document?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          max_discount_percent?: number
          parent_user_id?: string | null
          phone?: string | null
          store_name?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_collaborator: { Args: { _user_id: string }; Returns: boolean }
      next_document_number: { Args: { _kind: string }; Returns: string }
      owner_user_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "revendedor" | "colaborador"
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
      app_role: ["admin", "revendedor", "colaborador"],
    },
  },
} as const
