// OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Kaynak: supabase/migrations/*.sql
// Yeniden üretmek için: npm run db:types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ad_campaigns: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          placement: string;
          city: string | null;
          district: string | null;
          category: string | null;
          budget_cents: number;
          status: string;
          starts_at: string;
          ends_at: string | null;
          impressions: number;
          clicks: number;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          placement?: string;
          city?: string | null;
          district?: string | null;
          category?: string | null;
          budget_cents?: number;
          status?: string;
          starts_at?: string;
          ends_at?: string | null;
          impressions?: number;
          clicks?: number;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          placement?: string;
          city?: string | null;
          district?: string | null;
          category?: string | null;
          budget_cents?: number;
          status?: string;
          starts_at?: string;
          ends_at?: string | null;
          impressions?: number;
          clicks?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      ad_events: {
        Row: {
          id: string;
          ad_id: string;
          kind: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ad_id: string;
          kind: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          ad_id?: string;
          kind?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ad_events_ad_id_ad_campaigns_id_fk";
            columns: ["ad_id"];
            isOneToOne: false;
            referencedRelation: "ad_campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_contents: {
        Row: {
          id: string;
          business_id: string;
          kind: string;
          platform: string | null;
          title: string;
          body: string;
          cta: string | null;
          variant: string | null;
          meta: Json | null;
          status: string;
          created_by: string;
          created_at: string;
          approved_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          kind: string;
          platform?: string | null;
          title: string;
          body: string;
          cta?: string | null;
          variant?: string | null;
          meta?: Json | null;
          status?: string;
          created_by?: string;
          created_at?: string;
          approved_at?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          kind?: string;
          platform?: string | null;
          title?: string;
          body?: string;
          cta?: string | null;
          variant?: string | null;
          meta?: Json | null;
          status?: string;
          created_by?: string;
          created_at?: string;
          approved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_contents_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_settings: {
        Row: {
          id: string;
          key: string;
          value: string;
          description: string | null;
        };
        Insert: {
          id?: string;
          key: string;
          value: string;
          description?: string | null;
        };
        Update: {
          id?: string;
          key?: string;
          value?: string;
          description?: string | null;
        };
        Relationships: [];
      };
      analytics_events: {
        Row: {
          id: string;
          business_id: string | null;
          campaign_id: string | null;
          user_id: string | null;
          kind: string;
          meta: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id?: string | null;
          campaign_id?: string | null;
          user_id?: string | null;
          kind: string;
          meta?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string | null;
          campaign_id?: string | null;
          user_id?: string | null;
          kind?: string;
          meta?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "analytics_events_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analytics_events_campaign_id_campaigns_id_fk";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analytics_events_user_id_users_id_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          actor: string;
          role: string;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          meta: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor: string;
          role?: string;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          meta?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor?: string;
          role?: string;
          action?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          meta?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      business_contracts: {
        Row: {
          id: string;
          business_id: string;
          commission_rate: number;
          commission_base: string;
          fixed_fee_cents: number;
          per_customer_fee_cents: number;
          referral_rate: number;
          pool_contribution_rate: number;
          damping_reward_rate: number;
          package_code: string;
          active: boolean;
        };
        Insert: {
          id?: string;
          business_id: string;
          commission_rate?: number;
          commission_base?: string;
          fixed_fee_cents?: number;
          per_customer_fee_cents?: number;
          referral_rate?: number;
          pool_contribution_rate?: number;
          damping_reward_rate?: number;
          package_code?: string;
          active?: boolean;
        };
        Update: {
          id?: string;
          business_id?: string;
          commission_rate?: number;
          commission_base?: string;
          fixed_fee_cents?: number;
          per_customer_fee_cents?: number;
          referral_rate?: number;
          pool_contribution_rate?: number;
          damping_reward_rate?: number;
          package_code?: string;
          active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "business_contracts_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_contracts_package_fk";
            columns: ["package_code"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["code"];
          },
        ];
      };
      business_hours: {
        Row: {
          id: string;
          business_id: string;
          day_of_week: number;
          opens_at: string;
          closes_at: string;
          closed: boolean;
        };
        Insert: {
          id?: string;
          business_id: string;
          day_of_week: number;
          opens_at?: string;
          closes_at?: string;
          closed?: boolean;
        };
        Update: {
          id?: string;
          business_id?: string;
          day_of_week?: number;
          opens_at?: string;
          closes_at?: string;
          closed?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "business_hours_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_media: {
        Row: {
          id: string;
          business_id: string;
          kind: string;
          url: string | null;
          caption: string | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          business_id: string;
          kind?: string;
          url?: string | null;
          caption?: string | null;
          sort_order?: number;
        };
        Update: {
          id?: string;
          business_id?: string;
          kind?: string;
          url?: string | null;
          caption?: string | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "business_media_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_services: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          description: string | null;
          price_cents: number;
          duration_min: number | null;
          active: boolean;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          description?: string | null;
          price_cents: number;
          duration_min?: number | null;
          active?: boolean;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          description?: string | null;
          price_cents?: number;
          duration_min?: number | null;
          active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "business_services_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_staff: {
        Row: {
          id: string;
          business_id: string;
          user_key: string;
          name: string;
          email: string;
          role: string;
          active: boolean;
          auth_user_id: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          user_key: string;
          name: string;
          email: string;
          role?: string;
          active?: boolean;
          auth_user_id?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          user_key?: string;
          name?: string;
          email?: string;
          role?: string;
          active?: boolean;
          auth_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "business_staff_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      businesses: {
        Row: {
          id: string;
          slug: string;
          name: string;
          category: string;
          sub_category: string | null;
          sector_key: string;
          district: string;
          city: string;
          address: string;
          lat: number | null;
          lng: number | null;
          phone: string | null;
          whatsapp: string | null;
          website: string | null;
          instagram: string | null;
          description: string | null;
          story: string | null;
          logo_text: string | null;
          cover_image: string | null;
          plan_code: string;
          rating: number;
          review_count: number;
          verified: boolean;
          featured: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          category: string;
          sub_category?: string | null;
          sector_key?: string;
          district: string;
          city?: string;
          address: string;
          lat?: number | null;
          lng?: number | null;
          phone?: string | null;
          whatsapp?: string | null;
          website?: string | null;
          instagram?: string | null;
          description?: string | null;
          story?: string | null;
          logo_text?: string | null;
          cover_image?: string | null;
          plan_code?: string;
          rating?: number;
          review_count?: number;
          verified?: boolean;
          featured?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          category?: string;
          sub_category?: string | null;
          sector_key?: string;
          district?: string;
          city?: string;
          address?: string;
          lat?: number | null;
          lng?: number | null;
          phone?: string | null;
          whatsapp?: string | null;
          website?: string | null;
          instagram?: string | null;
          description?: string | null;
          story?: string | null;
          logo_text?: string | null;
          cover_image?: string | null;
          plan_code?: string;
          rating?: number;
          review_count?: number;
          verified?: boolean;
          featured?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "businesses_plan_code_fk";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["code"];
          },
        ];
      };
      campaigns: {
        Row: {
          id: string;
          business_id: string;
          code: string;
          title: string;
          description: string | null;
          type: string;
          discount_percent: number;
          discount_amount_cents: number;
          min_basket_cents: number;
          max_discount_cents: number;
          usage_limit: number | null;
          per_customer_limit: number;
          starts_at: string;
          ends_at: string | null;
          time_start: string | null;
          time_end: string | null;
          days: Json | null;
          status: string;
          qr_enabled: boolean;
          views: number;
          clicks: number;
          redemptions: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          code: string;
          title: string;
          description?: string | null;
          type?: string;
          discount_percent?: number;
          discount_amount_cents?: number;
          min_basket_cents?: number;
          max_discount_cents?: number;
          usage_limit?: number | null;
          per_customer_limit?: number;
          starts_at?: string;
          ends_at?: string | null;
          time_start?: string | null;
          time_end?: string | null;
          days?: Json | null;
          status?: string;
          qr_enabled?: boolean;
          views?: number;
          clicks?: number;
          redemptions?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          code?: string;
          title?: string;
          description?: string | null;
          type?: string;
          discount_percent?: number;
          discount_amount_cents?: number;
          min_basket_cents?: number;
          max_discount_cents?: number;
          usage_limit?: number | null;
          per_customer_limit?: number;
          starts_at?: string;
          ends_at?: string | null;
          time_start?: string | null;
          time_end?: string | null;
          days?: Json | null;
          status?: string;
          qr_enabled?: boolean;
          views?: number;
          clicks?: number;
          redemptions?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaigns_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      damping_pool: {
        Row: {
          id: string;
          key: string;
          balance_cents: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key?: string;
          balance_cents?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          balance_cents?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      damping_wallets: {
        Row: {
          id: string;
          user_id: string;
          available_cents: number;
          pending_cents: number;
          reserved_cents: number;
          lifetime_earned_cents: number;
          lifetime_spent_cents: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          available_cents?: number;
          pending_cents?: number;
          reserved_cents?: number;
          lifetime_earned_cents?: number;
          lifetime_spent_cents?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          available_cents?: number;
          pending_cents?: number;
          reserved_cents?: number;
          lifetime_earned_cents?: number;
          lifetime_spent_cents?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "damping_wallets_user_id_users_id_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      fraud_reviews: {
        Row: {
          id: string;
          transaction_id: string | null;
          user_id: string | null;
          reason: string;
          signals: Json | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          transaction_id?: string | null;
          user_id?: string | null;
          reason: string;
          signals?: Json | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          transaction_id?: string | null;
          user_id?: string | null;
          reason?: string;
          signals?: Json | null;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fraud_reviews_transaction_id_store_transactions_id_fk";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "store_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fraud_reviews_user_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_plan_days: {
        Row: {
          id: string;
          plan_id: string;
          day: number;
          theme: string;
          task: string;
          channel: string;
          caption: string | null;
          cta: string | null;
          done: boolean;
        };
        Insert: {
          id?: string;
          plan_id: string;
          day: number;
          theme: string;
          task: string;
          channel: string;
          caption?: string | null;
          cta?: string | null;
          done?: boolean;
        };
        Update: {
          id?: string;
          plan_id?: string;
          day?: number;
          theme?: string;
          task?: string;
          channel?: string;
          caption?: string | null;
          cta?: string | null;
          done?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_plan_days_plan_id_marketing_plans_id_fk";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "marketing_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_plans: {
        Row: {
          id: string;
          business_id: string;
          title: string;
          goal: string;
          sector_key: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          title: string;
          goal: string;
          sector_key: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          title?: string;
          goal?: string;
          sector_key?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_plans_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      packages: {
        Row: {
          id: string;
          code: string;
          name: string;
          price_monthly_cents: number;
          features: Json | null;
          ai_quota_monthly: number;
          active: boolean;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          price_monthly_cents?: number;
          features?: Json | null;
          ai_quota_monthly?: number;
          active?: boolean;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          price_monthly_cents?: number;
          features?: Json | null;
          ai_quota_monthly?: number;
          active?: boolean;
        };
        Relationships: [];
      };
      pool_ledger: {
        Row: {
          id: string;
          business_id: string | null;
          direction: string;
          amount_cents: number;
          ref_type: string | null;
          ref_id: string | null;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id?: string | null;
          direction: string;
          amount_cents: number;
          ref_type?: string | null;
          ref_id?: string | null;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string | null;
          direction?: string;
          amount_cents?: number;
          ref_type?: string | null;
          ref_id?: string | null;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pool_ledger_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          description: string | null;
          price_cents: number;
          discount_price_cents: number | null;
          category: string | null;
          image_url: string | null;
          active: boolean;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          description?: string | null;
          price_cents: number;
          discount_price_cents?: number | null;
          category?: string | null;
          image_url?: string | null;
          active?: boolean;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          description?: string | null;
          price_cents?: number;
          discount_price_cents?: number | null;
          category?: string | null;
          image_url?: string | null;
          active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "products_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      qr_codes: {
        Row: {
          id: string;
          code: string;
          business_id: string;
          campaign_id: string | null;
          customer_id: string | null;
          status: string;
          created_at: string;
          redeemed_at: string | null;
          transaction_id: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          business_id: string;
          campaign_id?: string | null;
          customer_id?: string | null;
          status?: string;
          created_at?: string;
          redeemed_at?: string | null;
          transaction_id?: string | null;
        };
        Update: {
          id?: string;
          code?: string;
          business_id?: string;
          campaign_id?: string | null;
          customer_id?: string | null;
          status?: string;
          created_at?: string;
          redeemed_at?: string | null;
          transaction_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "qr_codes_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qr_codes_campaign_id_campaigns_id_fk";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qr_codes_customer_id_users_id_fk";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qr_codes_transaction_fk";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "store_transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      referral_rewards: {
        Row: {
          id: string;
          referral_id: string;
          transaction_id: string | null;
          inviter_id: string;
          amount_cents: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          referral_id: string;
          transaction_id?: string | null;
          inviter_id: string;
          amount_cents?: number;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          referral_id?: string;
          transaction_id?: string | null;
          inviter_id?: string;
          amount_cents?: number;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "referral_rewards_inviter_fk";
            columns: ["inviter_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referral_rewards_referral_id_referrals_id_fk";
            columns: ["referral_id"];
            isOneToOne: false;
            referencedRelation: "referrals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referral_rewards_transaction_id_store_transactions_id_fk";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "store_transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      referrals: {
        Row: {
          id: string;
          inviter_id: string;
          invitee_id: string;
          code: string;
          status: string;
          fraud_flags: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          inviter_id: string;
          invitee_id: string;
          code: string;
          status?: string;
          fraud_flags?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          inviter_id?: string;
          invitee_id?: string;
          code?: string;
          status?: string;
          fraud_flags?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "referrals_invitee_fk";
            columns: ["invitee_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referrals_inviter_fk";
            columns: ["inviter_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          id: string;
          business_id: string;
          author_name: string;
          rating: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          author_name: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          author_name?: string;
          rating?: number;
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      settlements: {
        Row: {
          id: string;
          business_id: string;
          period_start: string;
          period_end: string;
          gross_sales_cents: number;
          discount_cents: number;
          damping_used_cents: number;
          net_sales_cents: number;
          commission_cents: number;
          pool_contribution_cents: number;
          pool_consumed_cents: number;
          net_position_cents: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          period_start: string;
          period_end: string;
          gross_sales_cents?: number;
          discount_cents?: number;
          damping_used_cents?: number;
          net_sales_cents?: number;
          commission_cents?: number;
          pool_contribution_cents?: number;
          pool_consumed_cents?: number;
          net_position_cents?: number;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          period_start?: string;
          period_end?: string;
          gross_sales_cents?: number;
          discount_cents?: number;
          damping_used_cents?: number;
          net_sales_cents?: number;
          commission_cents?: number;
          pool_contribution_cents?: number;
          pool_consumed_cents?: number;
          net_position_cents?: number;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "settlements_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      store_transactions: {
        Row: {
          id: string;
          business_id: string;
          campaign_id: string | null;
          customer_id: string | null;
          cashier_id: string | null;
          qr_code_id: string | null;
          receipt_no: string;
          gross_amount_cents: number;
          discount_cents: number;
          damping_used_cents: number;
          net_amount_cents: number;
          commission_base_cents: number;
          commission_rate: number;
          commission_cents: number;
          pool_contribution_cents: number;
          damping_earned_cents: number;
          status: string;
          payment_method: string;
          reversal_of: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          campaign_id?: string | null;
          customer_id?: string | null;
          cashier_id?: string | null;
          qr_code_id?: string | null;
          receipt_no: string;
          gross_amount_cents: number;
          discount_cents?: number;
          damping_used_cents?: number;
          net_amount_cents: number;
          commission_base_cents?: number;
          commission_rate?: number;
          commission_cents?: number;
          pool_contribution_cents?: number;
          damping_earned_cents?: number;
          status?: string;
          payment_method?: string;
          reversal_of?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          campaign_id?: string | null;
          customer_id?: string | null;
          cashier_id?: string | null;
          qr_code_id?: string | null;
          receipt_no?: string;
          gross_amount_cents?: number;
          discount_cents?: number;
          damping_used_cents?: number;
          net_amount_cents?: number;
          commission_base_cents?: number;
          commission_rate?: number;
          commission_cents?: number;
          pool_contribution_cents?: number;
          damping_earned_cents?: number;
          status?: string;
          payment_method?: string;
          reversal_of?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "store_transactions_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "store_transactions_campaign_id_campaigns_id_fk";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "store_transactions_cashier_id_business_staff_id_fk";
            columns: ["cashier_id"];
            isOneToOne: false;
            referencedRelation: "business_staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "store_transactions_customer_id_users_id_fk";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "store_transactions_qr_code_id_qr_codes_id_fk";
            columns: ["qr_code_id"];
            isOneToOne: false;
            referencedRelation: "qr_codes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "store_transactions_reversal_fk";
            columns: ["reversal_of"];
            isOneToOne: false;
            referencedRelation: "store_transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          district: string | null;
          referral_code: string;
          referred_by: string | null;
          created_at: string;
          auth_user_id: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          phone?: string | null;
          district?: string | null;
          referral_code: string;
          referred_by?: string | null;
          created_at?: string;
          auth_user_id?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          phone?: string | null;
          district?: string | null;
          referral_code?: string;
          referred_by?: string | null;
          created_at?: string;
          auth_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "users_referred_by_fk";
            columns: ["referred_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      wallet_ledger: {
        Row: {
          id: string;
          wallet_id: string;
          user_id: string;
          entry_type: string;
          status: string;
          amount_cents: number;
          ref_type: string | null;
          ref_id: string | null;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          user_id: string;
          entry_type: string;
          status: string;
          amount_cents: number;
          ref_type?: string | null;
          ref_id?: string | null;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          user_id?: string;
          entry_type?: string;
          status?: string;
          amount_cents?: number;
          ref_type?: string | null;
          ref_id?: string | null;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_user_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wallet_ledger_wallet_id_damping_wallets_id_fk";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "damping_wallets";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
