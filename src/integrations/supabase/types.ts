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
      activity_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          company_id: string
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          internal_user_id: string | null
          metadata: Json
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          internal_user_id?: string | null
          metadata?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          internal_user_id?: string | null
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_internal_user_id_fkey"
            columns: ["internal_user_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      architects: {
        Row: {
          created_at: string
          document: string | null
          email: string | null
          id: string
          name: string
          percentage: number
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          percentage?: number
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          percentage?: number
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
          operator_id: string | null
          operator_name: string | null
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
          operator_id?: string | null
          operator_name?: string | null
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
          operator_id?: string | null
          operator_name?: string | null
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
      carriers: {
        Row: {
          address: string | null
          address_number: string | null
          cep: string | null
          city: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          state: string | null
          state_registration: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          cep?: string | null
          city?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          state?: string | null
          state_registration?: string | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          cep?: string | null
          city?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          state?: string | null
          state_registration?: string | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          address_number: string | null
          cep: string | null
          city: string | null
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
          state: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          cep?: string | null
          city?: string | null
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
          state?: string | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          cep?: string | null
          city?: string | null
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
          state?: string | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      company_product_overrides: {
        Row: {
          base_price_override: number | null
          commission_percentage: number | null
          created_at: string
          global_product_id: string
          id: string
          labor_cost: number | null
          owner_user_id: string
          profit_margin: number | null
          updated_at: string
          waste_percentage: number | null
        }
        Insert: {
          base_price_override?: number | null
          commission_percentage?: number | null
          created_at?: string
          global_product_id: string
          id?: string
          labor_cost?: number | null
          owner_user_id: string
          profit_margin?: number | null
          updated_at?: string
          waste_percentage?: number | null
        }
        Update: {
          base_price_override?: number | null
          commission_percentage?: number | null
          created_at?: string
          global_product_id?: string
          id?: string
          labor_cost?: number | null
          owner_user_id?: string
          profit_margin?: number | null
          updated_at?: string
          waste_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "company_product_overrides_global_product_id_fkey"
            columns: ["global_product_id"]
            isOneToOne: false
            referencedRelation: "global_supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_product_overrides_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_supplier_config: {
        Row: {
          commission: number
          created_at: string
          id: string
          labor_cost: number | null
          loss: number
          margin: number
          owner_user_id: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          commission?: number
          created_at?: string
          id?: string
          labor_cost?: number | null
          loss?: number
          margin?: number
          owner_user_id: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          commission?: number
          created_at?: string
          id?: string
          labor_cost?: number | null
          loss?: number
          margin?: number
          owner_user_id?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_supplier_config_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      company_switch_audit: {
        Row: {
          from_company_id: string | null
          id: string
          switched_at: string
          to_company_id: string | null
          user_id: string
        }
        Insert: {
          from_company_id?: string | null
          id?: string
          switched_at?: string
          to_company_id?: string | null
          user_id: string
        }
        Update: {
          from_company_id?: string | null
          id?: string
          switched_at?: string
          to_company_id?: string | null
          user_id?: string
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
      global_supplier_products: {
        Row: {
          active: boolean
          base_price: number
          category: string
          code: string
          created_at: string
          description: string
          id: string
          ncm: string | null
          supplier_id: string
          updated_at: string
          width_cm: number | null
        }
        Insert: {
          active?: boolean
          base_price?: number
          category: string
          code: string
          created_at?: string
          description: string
          id?: string
          ncm?: string | null
          supplier_id: string
          updated_at?: string
          width_cm?: number | null
        }
        Update: {
          active?: boolean
          base_price?: number
          category?: string
          code?: string
          created_at?: string
          description?: string
          id?: string
          ncm?: string | null
          supplier_id?: string
          updated_at?: string
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "global_supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
      operators: {
        Row: {
          active: boolean
          can_create_clients: boolean
          can_create_products: boolean
          can_delete_orders: boolean
          can_edit_budgets: boolean
          created_at: string
          failed_pin_attempts: number
          id: string
          is_global_admin: boolean
          locked_until: string | null
          max_discount_percent: number
          name: string
          nickname: string | null
          operational_account_id: string | null
          owner_user_id: string
          pin_hash: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          can_create_clients?: boolean
          can_create_products?: boolean
          can_delete_orders?: boolean
          can_edit_budgets?: boolean
          created_at?: string
          failed_pin_attempts?: number
          id?: string
          is_global_admin?: boolean
          locked_until?: string | null
          max_discount_percent?: number
          name: string
          nickname?: string | null
          operational_account_id?: string | null
          owner_user_id: string
          pin_hash: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          can_create_clients?: boolean
          can_create_products?: boolean
          can_delete_orders?: boolean
          can_edit_budgets?: boolean
          created_at?: string
          failed_pin_attempts?: number
          id?: string
          is_global_admin?: boolean
          locked_until?: string | null
          max_discount_percent?: number
          name?: string
          nickname?: string | null
          operational_account_id?: string | null
          owner_user_id?: string
          pin_hash?: string
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
          operator_id: string | null
          operator_name: string | null
          status: string
          stock_processed: boolean
          stock_snapshot: Json | null
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
          operator_id?: string | null
          operator_name?: string | null
          status?: string
          stock_processed?: boolean
          stock_snapshot?: Json | null
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
          operator_id?: string | null
          operator_name?: string | null
          status?: string
          stock_processed?: boolean
          stock_snapshot?: Json | null
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
      price_increase_history: {
        Row: {
          category: string
          created_at: string
          direction: string | null
          field: string
          id: string
          new_value: number | null
          owner_user_id: string
          percentage: number | null
          products_affected: number
          supplier_id: string
          supplier_is_global: boolean
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          direction?: string | null
          field?: string
          id?: string
          new_value?: number | null
          owner_user_id: string
          percentage?: number | null
          products_affected?: number
          supplier_id: string
          supplier_is_global?: boolean
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          direction?: string | null
          field?: string
          id?: string
          new_value?: number | null
          owner_user_id?: string
          percentage?: number | null
          products_affected?: number
          supplier_id?: string
          supplier_is_global?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_increase_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
          source_global_product_id: string | null
          stock_quantity: number
          supplier: string | null
          supplier_id: string | null
          updated_at: string
          user_id: string
          uses_default_config: boolean
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
          source_global_product_id?: string | null
          stock_quantity?: number
          supplier?: string | null
          supplier_id?: string | null
          updated_at?: string
          user_id: string
          uses_default_config?: boolean
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
          source_global_product_id?: string | null
          stock_quantity?: number
          supplier?: string | null
          supplier_id?: string | null
          updated_at?: string
          user_id?: string
          uses_default_config?: boolean
          value_per_meter?: number
          waste_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_source_global_product_id_fkey"
            columns: ["source_global_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"] | null
          active: boolean
          active_company_id: string | null
          address: string | null
          address_number: string | null
          avatar_url: string | null
          can_create_clients: boolean
          can_create_products: boolean
          can_delete_orders: boolean
          can_edit_budgets: boolean
          cep: string | null
          city: string | null
          company_group_id: string | null
          complement: string | null
          created_at: string
          document: string | null
          document_type: string | null
          email: string | null
          full_name: string | null
          id: string
          legal_name: string | null
          max_discount_percent: number
          neighborhood: string | null
          parent_user_id: string | null
          phone: string | null
          pin_hash: string | null
          state: string | null
          state_registration: string | null
          store_name: string | null
          updated_at: string
          username: string | null
          whatsapp: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          active?: boolean
          active_company_id?: string | null
          address?: string | null
          address_number?: string | null
          avatar_url?: string | null
          can_create_clients?: boolean
          can_create_products?: boolean
          can_delete_orders?: boolean
          can_edit_budgets?: boolean
          cep?: string | null
          city?: string | null
          company_group_id?: string | null
          complement?: string | null
          created_at?: string
          document?: string | null
          document_type?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          legal_name?: string | null
          max_discount_percent?: number
          neighborhood?: string | null
          parent_user_id?: string | null
          phone?: string | null
          pin_hash?: string | null
          state?: string | null
          state_registration?: string | null
          store_name?: string | null
          updated_at?: string
          username?: string | null
          whatsapp?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          active?: boolean
          active_company_id?: string | null
          address?: string | null
          address_number?: string | null
          avatar_url?: string | null
          can_create_clients?: boolean
          can_create_products?: boolean
          can_delete_orders?: boolean
          can_edit_budgets?: boolean
          cep?: string | null
          city?: string | null
          company_group_id?: string | null
          complement?: string | null
          created_at?: string
          document?: string | null
          document_type?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          legal_name?: string | null
          max_discount_percent?: number
          neighborhood?: string | null
          parent_user_id?: string | null
          phone?: string | null
          pin_hash?: string | null
          state?: string | null
          state_registration?: string | null
          store_name?: string | null
          updated_at?: string
          username?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_company_id_fkey"
            columns: ["active_company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_group_id_fkey"
            columns: ["company_group_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          movement_type: string
          new_stock: number
          notes: string | null
          order_id: string | null
          owner_user_id: string
          previous_stock: number
          product_id: string
          quantity: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type: string
          new_stock: number
          notes?: string | null
          order_id?: string | null
          owner_user_id: string
          previous_stock: number
          product_id: string
          quantity: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: string
          new_stock?: number
          notes?: string | null
          order_id?: string | null
          owner_user_id?: string
          previous_stock?: number
          product_id?: string
          quantity?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          address_number: string | null
          auto_distribute: boolean
          categories: Database["public"]["Enums"]["supplier_category"][]
          cep: string | null
          city: string | null
          contact_name: string | null
          created_at: string
          distribute_category: string | null
          document: string | null
          email: string | null
          id: string
          is_global: boolean
          legal_name: string | null
          notes: string | null
          phone: string | null
          publish_catalog: boolean
          site: string | null
          state: string | null
          state_registration: string | null
          trade_name: string | null
          updated_at: string
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          address_number?: string | null
          auto_distribute?: boolean
          categories?: Database["public"]["Enums"]["supplier_category"][]
          cep?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          distribute_category?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_global?: boolean
          legal_name?: string | null
          notes?: string | null
          phone?: string | null
          publish_catalog?: boolean
          site?: string | null
          state?: string | null
          state_registration?: string | null
          trade_name?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          address_number?: string | null
          auto_distribute?: boolean
          categories?: Database["public"]["Enums"]["supplier_category"][]
          cep?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          distribute_category?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_global?: boolean
          legal_name?: string | null
          notes?: string | null
          phone?: string | null
          publish_catalog?: boolean
          site?: string | null
          state?: string | null
          state_registration?: string | null
          trade_name?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
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
      apply_bulk_config_change: {
        Args: {
          _category: string
          _field: string
          _new_value: number
          _supplier_id: string
        }
        Returns: {
          history_id: string
          products_affected: number
        }[]
      }
      apply_order_stock: { Args: { _order_id: string }; Returns: Json }
      apply_price_increase: {
        Args: {
          _category: string
          _direction?: string
          _percentage: number
          _supplier_id: string
        }
        Returns: {
          history_id: string
          products_affected: number
        }[]
      }
      apply_supplier_default_config: {
        Args: {
          _commission: number
          _labor_cost: number
          _loss: number
          _margin: number
          _supplier_id: string
        }
        Returns: number
      }
      can_switch_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      clear_active_company: { Args: never; Returns: undefined }
      company_group_owner_ids: { Args: { _owner: string }; Returns: string[] }
      count_active_internal_users: { Args: never; Returns: number }
      create_company_owner_operator: {
        Args: { _company_id: string; _owner_name: string; _pin_hash: string }
        Returns: string
      }
      get_effective_profile: {
        Args: never
        Returns: {
          address: string
          address_number: string
          avatar_url: string
          cep: string
          city: string
          complement: string
          document: string
          document_type: string
          email: string
          full_name: string
          id: string
          is_switched: boolean
          legal_name: string
          neighborhood: string
          phone: string
          state: string
          state_registration: string
          store_name: string
          whatsapp: string
        }[]
      }
      get_store_profile: {
        Args: { _user_id: string }
        Returns: {
          address: string
          address_number: string
          avatar_url: string
          cep: string
          city: string
          document: string
          document_type: string
          email: string
          full_name: string
          id: string
          phone: string
          state: string
          store_name: string
        }[]
      }
      get_supplier_wizard_state: {
        Args: never
        Returns: {
          category: string
          configured: boolean
          product_count: number
          supplier_id: string
          supplier_name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_collaborator: { Args: { _user_id: string }; Returns: boolean }
      is_internal_global_admin: {
        Args: { _operator_id: string }
        Returns: boolean
      }
      list_switchable_companies: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          id: string
          is_active: boolean
          is_self: boolean
          store_name: string
        }[]
      }
      list_visible_products: {
        Args: never
        Returns: {
          barcode: string
          base_price: number
          category: string
          code: string
          commission_percentage: number
          config_pending: boolean
          description: string
          effective_price: number
          has_override: boolean
          id: string
          labor_cost: number
          name: string
          ncm: string
          profit_margin: number
          source: string
          supplier: string
          supplier_id: string
          waste_percentage: number
          width_cm: number
        }[]
      }
      list_visible_products_page: {
        Args: {
          _category: string
          _limit: number
          _offset: number
          _search: string
        }
        Returns: {
          barcode: string
          base_price: number
          category: string
          code: string
          commission_percentage: number
          config_pending: boolean
          description: string
          effective_price: number
          has_override: boolean
          id: string
          labor_cost: number
          name: string
          ncm: string
          profit_margin: number
          source: string
          supplier: string
          supplier_id: string
          total_count: number
          waste_percentage: number
          width_cm: number
        }[]
      }
      natural_key: { Args: { _s: string }; Returns: string }
      next_document_number: { Args: { _kind: string }; Returns: string }
      owner_user_id: { Args: { _user_id: string }; Returns: string }
      preview_bulk_config_change: {
        Args: {
          _category: string
          _field: string
          _new_value: number
          _supplier_id: string
        }
        Returns: {
          sample: Json
          total: number
        }[]
      }
      preview_price_increase: {
        Args: {
          _category: string
          _direction?: string
          _percentage: number
          _supplier_id: string
        }
        Returns: {
          sample: Json
          total: number
        }[]
      }
      preview_restore_default_catalog: {
        Args: never
        Returns: {
          commercial_configs: number
          global_products: number
          particular_products: number
        }[]
      }
      register_pin_attempt: {
        Args: { _operator_id: string; _success: boolean }
        Returns: Json
      }
      reset_company_product_override: {
        Args: { _global_product_id: string }
        Returns: boolean
      }
      restore_default_catalog: {
        Args: never
        Returns: {
          commercial_configs_removed: number
          global_products: number
          particular_products_deleted: number
        }[]
      }
      revert_order_stock: { Args: { _order_id: string }; Returns: Json }
      set_active_company_avatar: { Args: { _avatar: string }; Returns: string }
      switch_active_company: { Args: { _company_id: string }; Returns: string }
      update_active_company_commercial: {
        Args: { _data: Json }
        Returns: undefined
      }
      update_company_commercial: {
        Args: { _company_id: string; _data: Json }
        Returns: undefined
      }
      upsert_company_product_override: {
        Args: {
          _base_price_override: number
          _commission: number
          _global_product_id: string
          _labor_cost: number
          _loss: number
          _margin: number
        }
        Returns: string
      }
    }
    Enums: {
      account_type: "admin" | "revendedor" | "operacional"
      app_role: "admin" | "revendedor" | "colaborador"
      supplier_category:
        | "foam"
        | "paspatur"
        | "impressao"
        | "perfil"
        | "vidro"
        | "colagem"
        | "diversos"
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
      account_type: ["admin", "revendedor", "operacional"],
      app_role: ["admin", "revendedor", "colaborador"],
      supplier_category: [
        "foam",
        "paspatur",
        "impressao",
        "perfil",
        "vidro",
        "colagem",
        "diversos",
      ],
    },
  },
} as const
