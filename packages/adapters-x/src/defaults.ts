// Last-resort values when neither the Config nor the page's bundle provide them.
// Observed on 2026-10-11 (docs/research/x-internal-api.md); queryIds rotate every few weeks.

export type OperationName = "Viewer" | "TweetDetail" | "FavoriteTweet" | "CreateTweet"

export const DEFAULT_QUERY_IDS: Record<OperationName, string> = {
  Viewer: "TpQxQtWMTMnIAMPlMGMqNw",
  TweetDetail: "3BlMtudy4N-d78ch7zTLZQ",
  FavoriteTweet: "lI07N6Otwv1PhnEgXILM7A",
  CreateTweet: "wR5Z_lEibLvkew3tF9w-Sg",
}

const TIMELINE_FEATURES: Record<string, boolean> = {
  rweb_video_screen_enabled: false,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: true,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: false,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  rweb_sports_post_context_enabled: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_nested_quote_preview_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_enhance_cards_enabled: false,
}

export const DEFAULT_FEATURES: Record<OperationName, Record<string, boolean>> = {
  Viewer: {},
  TweetDetail: TIMELINE_FEATURES,
  FavoriteTweet: {},
  CreateTweet: TIMELINE_FEATURES,
}

export const DEFAULT_FIELD_TOGGLES: Record<OperationName, Record<string, boolean>> = {
  Viewer: { isDelegate: false, withAuxiliaryUserLabels: false },
  TweetDetail: {
    withArticleRichContentState: true,
    withArticlePlainText: false,
    withArticleSummaryText: true,
    withArticleVoiceOver: true,
    withGrokAnalyze: false,
    withDisallowedReplyControls: false,
  },
  FavoriteTweet: {},
  CreateTweet: {},
}
