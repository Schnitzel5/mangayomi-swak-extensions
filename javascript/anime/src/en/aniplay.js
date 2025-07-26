const mangayomiSources = [
  {
    "name": "Aniplay",
    "lang": "en",
    "id": 1060895795,
    "baseUrl": "https://aniplaynow.live",
    "apiUrl": "https://aniplaynow.live",
    "iconUrl":
      "https://www.google.com/s2/favicons?sz=128&domain=https://aniplaynow.live/",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.7.5",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "anime/src/en/aniplay.js",
  },
];

// Authors: - Swakshan

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  getHeaders(url) {
    return {
      "Referer": url,
    };
  }

  getPreference(key) {
    const preferences = new SharedPreferences();
    return preferences.get(key);
  }

  getBaseUrl() {
    return "https://" + this.getPreference("aniplay_override_base_url");
  }

  // code from torrentioanime.js
  anilistQuery() {
    return `
                query ($page: Int, $perPage: Int, $sort: [MediaSort], $search: String) {
                    Page(page: $page, perPage: $perPage) {
                        pageInfo {
                            currentPage
                            hasNextPage
                        }
                        media(type: ANIME, sort: $sort, search: $search, status_in: [RELEASING, FINISHED, NOT_YET_RELEASED]) {
                            id
                            title {
                                romaji
                                english
                                native
                            }
                            coverImage {
                                extraLarge
                                large
                            }
                            description
                            status
                            tags {
                                name
                            }
                            genres
                            studios {
                                nodes {
                                    name
                                }
                            }
                            countryOfOrigin
                            isAdult
                        }
                    }
                }
            `.trim();
  }

  // code from torrentioanime.js
  anilistLatestQuery() {
    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    return `
                query ($page: Int, $perPage: Int, $sort: [AiringSort]) {
                Page(page: $page, perPage: $perPage) {
                    pageInfo {
                    currentPage
                    hasNextPage
                    }
                    airingSchedules(
                    airingAt_greater: 0
                    airingAt_lesser: ${currentTimeInSeconds - 10000}
                    sort: $sort
                    ) {
                    media {
                        id
                        title {
                        romaji
                        english
                        native
                        }
                        coverImage {
                        extraLarge
                        large
                        }
                        description
                        status
                        tags {
                        name
                        }
                        genres
                        studios {
                        nodes {
                            name
                        }
                        }
                        countryOfOrigin
                        isAdult
                    }
                    }
                }
                }
            `.trim();
  }

  // code from torrentioanime.js
  async getAnimeDetails(anilistId) {
    const query = `
                    query($id: Int){
                        Media(id: $id){
                            id
                            title {
                                romaji
                                english
                                native
                            }
                            coverImage {
                                extraLarge
                                large
                            }
                            description
                            status
                            tags {
                                name
                            }
                            genres
                            studios {
                                nodes {
                                    name
                                }
                            }
                            format    
                            countryOfOrigin
                            isAdult
                        }
                    }
                `.trim();

    const variables = JSON.stringify({ id: anilistId });

    const res = await this.makeGraphQLRequest(query, variables);
    const media = JSON.parse(res.body).data.Media;
    const anime = {};
    anime.name = (() => {
      var preferenceTitle = this.getPreference("aniplay_pref_title");
      switch (preferenceTitle) {
        case "romaji":
          return media?.title?.romaji || "";
        case "english":
          return media?.title?.english?.trim() || media?.title?.romaji || "";
        case "native":
          return media?.title?.native || "";
        default:
          return "";
      }
    })();
    anime.imageUrl =
      media?.coverImage?.extraLarge || media?.coverImage?.large || "";
    anime.description = (media?.description || "No Description")
      .replace(/<br><br>/g, "\n")
      .replace(/<.*?>/g, "");

    anime.status = (() => {
      switch (media?.status) {
        case "RELEASING":
          return 0;
        case "FINISHED":
          return 1;
        case "HIATUS":
          return 2;
        case "NOT_YET_RELEASED":
          return 4;
        default:
          return 5;
      }
    })();

    const tagsList = media?.tags?.map((tag) => tag.name).filter(Boolean) || [];
    const genresList = media?.genres || [];
    anime.genre = [...new Set([...tagsList, ...genresList])].sort();
    const studiosList =
      media?.studios?.nodes?.map((node) => node.name).filter(Boolean) || [];
    anime.author = studiosList.sort().join(", ");
    anime.format = media.format;
    return anime;
  }

  // code from torrentioanime.js
  async makeGraphQLRequest(query, variables) {
    const res = await this.client.post(
      "https://graphql.anilist.co",
      {},
      {
        query,
        variables,
      }
    );
    return res;
  }

  // code from torrentioanime.js
  parseSearchJson(jsonLine, isLatestQuery = false) {
    const jsonData = JSON.parse(jsonLine);
    jsonData.type = isLatestQuery ? "AnilistMetaLatest" : "AnilistMeta";
    const metaData = jsonData;

    const mediaList =
      metaData.type == "AnilistMeta"
        ? metaData.data?.Page?.media || []
        : metaData.data?.Page?.airingSchedules.map(
            (schedule) => schedule.media
          ) || [];

    const hasNextPage =
      metaData.type == "AnilistMeta" || metaData.type == "AnilistMetaLatest"
        ? metaData.data?.Page?.pageInfo?.hasNextPage || false
        : false;

    const animeList = mediaList
      .filter(
        (media) =>
          !(
            (media?.countryOfOrigin === "CN" || media?.isAdult) &&
            isLatestQuery
          )
      )
      .map((media) => {
        const anime = {};
        anime.link = media?.id?.toString() || "";
        anime.name = (() => {
          var preferenceTitle = this.getPreference("aniplay_pref_title");
          switch (preferenceTitle) {
            case "romaji":
              return media?.title?.romaji || "";
            case "english":
              return (
                media?.title?.english?.trim() || media?.title?.romaji || ""
              );
            case "native":
              return media?.title?.native || "";
            default:
              return "";
          }
        })();
        anime.imageUrl =
          media?.coverImage?.extraLarge || media?.coverImage?.large || "";

        return anime;
      });

    return { list: animeList, hasNextPage: hasNextPage };
  }

  async getPopular(page) {
    const variables = JSON.stringify({
      page: page,
      perPage: 30,
      sort: "TRENDING_DESC",
    });

    const res = await this.makeGraphQLRequest(this.anilistQuery(), variables);

    return this.parseSearchJson(res.body);
  }

  async getLatestUpdates(page) {
    const variables = JSON.stringify({
      page: page,
      perPage: 30,
      sort: "TIME_DESC",
    });

    const res = await this.makeGraphQLRequest(
      this.anilistLatestQuery(),
      variables
    );

    return this.parseSearchJson(res.body, true);
  }

  async search(query, page, filters) {
    const variables = JSON.stringify({
      page: page,
      perPage: 30,
      sort: "POPULARITY_DESC",
      search: query,
    });

    const res = await this.makeGraphQLRequest(this.anilistQuery(), variables);

    return this.parseSearchJson(res.body);
  }

  get supportsLatest() {
    throw new Error("supportsLatest not implemented");
  }

  async aniplayRequest(slug, body) {
    var baseUrl = this.getBaseUrl();
    var hdr = this.getHeaders(baseUrl);

    var next_action = "";

    if (baseUrl.includes("aniplaynow")) {
      var anilistId = body[0];
      if (slug.includes("info/")) {
        next_action = `episodes?id=${anilistId}&releasing=false&refresh=false`;
      } else if (slug.includes("watch/")) {
        var provider = body[1];
        var epId = body[2];
        var epNum = body[3];
        var subType = body[4];
        next_action = `sources?id=${anilistId}&provider=${provider}&epId=${epId}&epNum=${epNum}&subType=${subType}&cache=true`;
      }
      var api = `${baseUrl}/api/anime/${next_action}`;
      var response = await this.client.get(api, hdr);
      if (response.statusCode != 200) {
        throw new Error("Error: " + response.statusText);
      }
      return JSON.parse(response.body);
    }

    var next_action_overrides = await this.extractKeys(baseUrl);

    if (slug.includes("info/")) {
      next_action = next_action_overrides["getEpisodes"];
    } else if (slug.includes("watch/")) {
      next_action = next_action_overrides["getSources"];
    }
    var url = `${baseUrl}/anime/${slug}`;
    hdr["next-action"] = next_action;
    hdr["content-type"] = "application/json";

    var response = await this.client.post(url, hdr, body);

    if (response.statusCode != 200) {
      throw new Error("Error: " + response.statusText);
    }
    return JSON.parse(response.body.split("1:")[1]);
  }

  async getDetail(url) {
    var anilistId = url;
    if (url.includes("info/")) {
      anilistId = url.substring(url.lastIndexOf("info/") + 5);
    }

    var slug = `info/${anilistId}`;
    var animeData = await this.getAnimeDetails(anilistId);
    animeData.link = `${this.getBaseUrl()}/anime/${slug}`;

    var chapters = [];
    var status = animeData.status;
    if (status != 4) {
      var body = [anilistId, true, false];
      var result = await this.aniplayRequest(slug, body);
      if (result.length < 1) {
        throw new Error("Error: No data found for the given URL");
      }
      if (result.hasOwnProperty("episodes")) {
        result = result["episodes"];
      }
      var chaps = {};
      for (var item of result) {
        var providerId = item["providerId"];

        var episodes = item["episodes"];

        for (var episode of episodes) {
          var id = episode.id;
          var number = episode.number.toString();

          var chap = chaps.hasOwnProperty(number) ? chaps[number] : {};

          var updatedAt = episode.hasOwnProperty("updatedAt")
            ? episode.updatedAt.toString()
            : null;
          var title = episode.hasOwnProperty("title") ? episode.title : "";
          var isFiller = episode.hasOwnProperty("isFiller")
            ? episode.isFiller
            : false;
          var hasDub = episode.hasOwnProperty("hasDub")
            ? episode.hasDub
            : false;

          chap.title = title == "" ? chap.title : title;
          chap.isFiller = isFiller || chap.isFiller;
          chap.hasDub = hasDub || chap.hasDub;
          chap.updatedAt = updatedAt ?? chap.updatedAt;

          var prvds = chap.hasOwnProperty("prvds") ? chap["prvds"] : {};
          prvds[providerId] = { anilistId, providerId, id, number, hasDub };
          chap["prvds"] = prvds;

          chaps[number] = chap;
        }
      }

      var format = animeData.format;
      var markFillers = this.getPreference("aniplay_pref_mark_filler");
      var addEpInfo = {};
      if (format != "MOVIE") {
        var addInfoApi = `https://api.ani.zip/mappings?anilist_id=${anilistId}`;
        var infoReq = await this.client.get(addInfoApi);
        if (infoReq.statusCode != 200) {
          console.log("Failed to fetch additional information");
        }
        var addChapInfo = JSON.parse(infoReq.body);
        addEpInfo = addChapInfo.episodes || {};
      }

      var prefEpTitle = this.getPreference("aniplay_pref_ep_title");
      for (var episodeNum in chaps) {
        var chap = chaps[episodeNum];
        var addInfo = addEpInfo[episodeNum] || {};
        var titleInfo = addInfo["title"] || {};

        var title = titleInfo[prefEpTitle] || titleInfo["en"] || chap.title;
        var dateUpload = chap.updatedAt;
        var scanlator = "SUB";
        if (chap.hasDub) {
          scanlator += ", DUB";
        }
        var isFillers = chap.isFiller;
        if (markFillers && isFillers) {
          scanlator = "FILLER, " + scanlator;
        }
        var epData = JSON.stringify(chap["prvds"]);

        chapters.push({
          name: `E${episodeNum}: ${title}`,
          url: epData,
          dateUpload,
          scanlator,
        });
      }
      if (format === "MOVIE") chapters[0].name = "Movie";
    }

    animeData.chapters = chapters.reverse();
    return animeData;
  }

  // For anime episode video list
  async getVideoList(url) {
    var pref_provider = this.getPreference("aniplay_pref_providers_3");
    // if there are no providers selected, use pahe as default provider.
    if (pref_provider.length < 1) pref_provider.push("pahe");

    // All providers available.
    var providerInfos = JSON.parse(url);
    var providers = Object.keys(providerInfos);

    var finalStreams = [];
    var user_audio_type = this.getPreference("aniplay_pref_audio_type_1");
    // if there are no preference then add sub
    if (user_audio_type.length < 1) user_audio_type.push("sub");

    for (var provider of providers) {
      // If the given provider is not selected, skip it.
      if (!pref_provider.includes(provider)) continue;

      var streams = [];
      var providerInfo = providerInfos[provider];

      var anilistId = providerInfo.anilistId;
      var providerId = providerInfo.providerId;
      var id = providerInfo.id;
      var number = providerInfo.number;
      var hasDub = providerInfo.hasDub;

      if (!hasDub && user_audio_type.includes("dub")) user_audio_type.splice(1);
      var slug = `watch/${anilistId}`;

      for (var audio of user_audio_type) {
        if (providerId == "koto") {
          // Koto always has softsubs aka subtitles are seperate.
          var slug = `${id}/${audio}`;
          streams = await this.getKotoStreams(providerId, slug, "soft" + audio);
        } else {
          var body = [anilistId, providerId, id, number, audio];

          var result = await this.aniplayRequest(slug, body);
          if (result === null) {
            continue;
          }

          if (providerId == "yuki") {
            // Yuki always has softsubs aka subtitles are seperate.
            streams = await this.getYukiStreams(
              providerId,
              result,
              "soft" + audio
            );
          } else if (providerId == "pahe" || providerId == "maze") {
            // Pahe & Maze always has hardsubs aka subtitles printed on video.
            streams = await this.getPaheMazeStreams(
              providerId,
              result,
              "hard" + audio
            );
          } else if (providerId == "zone") {
            streams = await this.getZoneStreams(
              providerId,
              result,
              "soft" + audio
            );
          } else if (providerId == "akane") {
            streams = await this.getAkaneStreams(
              providerId,
              result,
              "soft" + audio
            );
          } else {
            continue;
          }
        }

        if (this.getPreference("aniplay_proxy"))
          streams = this.addStreamProxy(streams);
        var sortedStreams = this.sortStreams(streams);
        finalStreams = [...sortedStreams, ...finalStreams];
      }
    }

    if (finalStreams.length < 1) {
      throw new Error("No streams found for the selected providers. Please try a different provider.");
    }
    return finalStreams;
  }

  getSourcePreferences() {
    return [
      {
        key: "aniplay_override_base_url",
        listPreference: {
          title: "Override base url",
          summary: "",
          valueIndex: 0,
          entries: ["aniplaynow.live (Main)", "aniplay.lol (Backup)"],
          entryValues: ["aniplaynow.live", "aniplay.lol"],
        },
      },
      {
        key: "aniplay_pref_title",
        listPreference: {
          title: "Preferred Title",
          summary: "",
          valueIndex: 0,
          entries: ["Romaji", "English", "Native"],
          entryValues: ["romaji", "english", "native"],
        },
      },
      {
        key: "aniplay_pref_ep_title",
        listPreference: {
          title: "Preferred episode title language",
          summary: "",
          valueIndex: 1,
          entries: ["Romaji", "English", "Japenese"],
          entryValues: ["x-jat", "en", "ja"],
        },
      },
      {
        key: "aniplay_pref_providers_3",
        multiSelectListPreference: {
          title: "Preferred server",
          summary: "Choose the server/s you want to extract streams from",
          values: ["maze", "yuki", "pahe", "koto", "zone", "akane"],
          entries: ["Maze", "Yuki", "Pahe", "Koto", "Zone", "Akane"],
          entryValues: ["maze", "yuki", "pahe", "koto", "zone", "akane"],
        },
      },
      {
        key: "aniplay_pref_mark_filler",
        switchPreferenceCompat: {
          title: "Mark filler episodes",
          summary: "Filler episodes will be marked with (F)",
          value: false,
        },
      },
      {
        key: "aniplay_pref_audio_type_1",
        multiSelectListPreference: {
          title: "Preferred stream sub/dub type",
          summary: "",
          values: ["sub"],
          entries: ["Sub", "Dub"],
          entryValues: ["sub", "dub"],
        },
      },
      {
        key: "aniplay_pref_extract_streams",
        switchPreferenceCompat: {
          title: "Split stream into different quality streams",
          summary: "Split stream Auto into 360p/720p/1080p",
          value: true,
        },
      },
      {
        key: "aniplay_pref_video_resolution",
        listPreference: {
          title: "Preferred video resolution",
          summary: "",
          valueIndex: 0,
          entries: ["Auto", "1080p", "720p", "480p", "360p"],
          entryValues: ["auto", "1080", "720", "480", "360"],
        },
      },
      {
        key: "aniplay_proxy",
        switchPreferenceCompat: {
          title: "Enable stream proxy",
          summary: "",
          value: false,
        },
      },
      {
        key: "aniplay_stream_proxy_1",
        editTextPreference: {
          title: "Override stream proxy url",
          summary: "https://paheproxy.aniplaynow.live",
          value: "https://paheproxy.aniplaynow.live",
          dialogTitle: "Override stream proxy url",
          dialogMessage: "",
        },
      },
    ];
  }

  // ----------- Stream manipulations -------
  // Sorts streams based on user preference.
  sortStreams(streams) {
    var sortedStreams = [];
    var copyStreams = streams.slice();

    var pref = this.getPreference("aniplay_pref_video_resolution");
    for (var stream of streams) {
      if (stream.quality.indexOf(pref) > -1) {
        sortedStreams.push(stream);
        var index = copyStreams.indexOf(stream);
        if (index > -1) {
          copyStreams.splice(index, 1);
        }
      }
    }
    return [...sortedStreams, ...copyStreams];
  }

  // Adds proxy to streams
  addStreamProxy(streams) {
    var proxyUrl = this.getPreference("aniplay_stream_proxy_1") + "/fetch?url=";

    streams.forEach((stream) => {
      var streamUrl = stream.url;
      var ref = stream.headers["Referer"];
      var proxyStreamUrl = proxyUrl + streamUrl + "&ref=" + ref;

      stream.url = proxyStreamUrl;
      stream.originalUrl = proxyStreamUrl;
    });

    return streams;
  }

  // Extracts the streams url for different resolutions from a hls stream.
  async extractStreams(url, audio, providerId, hdr = {}, defQuality = "Auto") {
    audio = audio.toUpperCase();
    var providerTag = providerId.toUpperCase();
    var streams = [
      {
        url: url,
        originalUrl: url,
        quality: `${defQuality} - ${providerTag} : ${audio}`,
        headers: hdr,
      },
    ];
    // Always extract zone streams  
    var doExtract = this.getPreference("aniplay_pref_extract_streams") || providerId === "zone";
    // Pahe, Maze & Owl only has auto
    if (providerId === "pahe" || providerId === "maze" || !doExtract) {
      return streams;
    }

    const response = await this.client.get(url, hdr);
    const body = response.body;
    const lines = body.split("\n");
    var audios = [];

    for (let i = 0; i < lines.length; i++) {
      var currentLine = lines[i]
      if (currentLine.startsWith("#EXT-X-STREAM-INF:")) {
        var resolution = currentLine.match(/RESOLUTION=(\d+x\d+)/)[1];
        var m3u8Url = lines[i + 1].trim();
        if (
          providerId === "yuki" ||
          providerId === "koto" ||
          providerId === "zone"
        ) {
          var orginalUrl = url;
          m3u8Url = orginalUrl.replace("master.m3u8", m3u8Url);
        }
        streams.push({
          url: m3u8Url,
          originalUrl: m3u8Url,
          quality: `${resolution} - ${providerTag} : ${audio}`,
          headers: hdr,
        });
      } else if (currentLine.startsWith("#EXT-X-MEDIA:TYPE=AUDIO")) {
        var attributesString = currentLine.split(",");
        var attributeRegex = /([A-Z-]+)=("([^"]*)"|[^,]*)/g;
        let match;
        var trackInfo = {};
        while ((match = attributeRegex.exec(attributesString)) !== null) {
          var key = match[1];
          var value = match[3] || match[2];
          if (key === "NAME") {
            trackInfo.label = value;
          } else if (key === "URI") {
            trackInfo.file = url.replace("master.m3u8", "") + value;
          }
        }
        (trackInfo.headers = hdr), audios.push(trackInfo);
      }
    }
    streams[0].audios = audios;
    return streams;
  }

  async getYukiStreams(providerId, result, audio) {
    var sources = result.sources[0];
    var m3u8Url = sources.file || sources.url;
    var streams = await this.extractStreams(m3u8Url, audio, providerId);

    var subs = [];
    result.subtitles
      .filter((sub) => sub.kind == "captions" || sub.label != "thumbnails")
      .forEach((sub) =>
        subs.push({
          "file": sub.url || sub.file,
          "label": sub.label,
        })
      );
    streams[0].subtitles = subs;
    return streams;
  }

  async getZoneStreams(providerId, result, audio) {
    var source = result.sources[0];
    var m3u8Url = source.url;

    var hdr = result.headers || {};
    var streams = await this.extractStreams(m3u8Url, audio, providerId, hdr);

    var subs = [];
    result.subtitles.forEach((sub) =>
      subs.push({
        "file": sub.url,
        "label": sub.label,
      })
    );
    streams[0].subtitles = subs;
    return streams;
  }

  async getPaheMazeStreams(providerId, result, audio) {
    var m3u8Url = result.sources[0].url;
    var hdr = result.headers;
    return await this.extractStreams(m3u8Url, audio, providerId, hdr);
  }

  async getAkaneStreams(providerId, result, audio) {
    var m3u8Url = result.sources[0].url;
    var streams = await this.extractStreams(m3u8Url, audio, providerId);
    var subs = [];
    result.subtitles
      .filter((sub) => sub.label != "thumbnails")
      .forEach((sub) =>
        subs.push({
          "file": sub.url,
          "label": sub.label,
        })
      );
    streams[0].subtitles = subs;
    return streams;
  }

  async getKotoStreams(providerId, slug, audio) {
    var embedUrl = `https://megaplay.buzz/stream/s-2/${slug}`;
    var hdr = this.getHeaders(embedUrl);
    var res = await this.client.get(embedUrl, hdr);
    if (res.statusCode != 200) {
      throw new Error("Koto: Could not find embed");
    }
    var doc = new Document(res.body);
    var megaplayPlayer = doc.selectFirst("#megaplay-player");
    if (megaplayPlayer == null) {
      throw new Error("Koto: Could not find media ID");
    }
    var mediaId = megaplayPlayer.attr("data-id");

    var api = `https://megaplay.buzz/stream/getSources?id=${mediaId}`;
    hdr["X-Requested-With"] = "XMLHttpRequest";
    res = await this.client.get(api, hdr);
    if (res.statusCode != 200) {
      throw new Error("Koto: Could not find stream");
    }
    delete hdr["X-Requested-With"];
    var result = JSON.parse(res.body);
    var m3u8Url = result.sources.file;
    var streams = await this.extractStreams(m3u8Url, audio, providerId, hdr);

    var subtitles = [];
    if (result.hasOwnProperty("tracks")) {
      result.tracks.forEach((sub) => {
        sub["headers"] = hdr;
        subtitles.push(sub);
      });
    }
    streams[0].subtitles = subtitles;

    return streams;
  }

  //------------ Extract keys ---------------
  async extractKeys(baseUrl) {
    const preferences = new SharedPreferences();
    let KEYS = preferences.getString("aniplay_keys", "");
    var KEYS_TS = parseInt(preferences.getString("aniplay_keys_ts", "0"));
    var now_ts = parseInt(new Date().getTime() / 1000);

    // Checks for keys every 60 minutes and baseUrl is present in the map
    if (now_ts - KEYS_TS < 60 * 60 && KEYS.includes(baseUrl)) {
      return JSON.parse(KEYS);
    }

    var randomAnimeUrl = baseUrl + "/anime/watch/1";
    var res = (await this.client.get(randomAnimeUrl)).body;
    var sKey = "/_next/static/chunks/app/(user)/(media)/";
    var eKey = '"';
    var start = res.indexOf(sKey) + sKey.length;
    var end = res.indexOf(eKey, start);
    var jsSlug = res.substring(start, end);

    var jsUrl = baseUrl + sKey + jsSlug;
    res = (await this.client.get(jsUrl)).body;
    var regex =
      /\(0,\w+\.createServerReference\)\("([a-f0-9]+)",\w+\.callServer,void 0,\w+\.findSourceMapURL,"(getSources|getEpisodes)"\)/g;
    var matches = [...res.matchAll(regex)];
    var keysMap = {};
    matches.forEach((match) => {
      var hashId = match[1];
      var functionName = match[2];
      keysMap[functionName] = hashId;
    });
    keysMap["baseUrl"] = baseUrl;

    preferences.setString("aniplay_keys", JSON.stringify(keysMap));
    preferences.setString("aniplay_keys_ts", now_ts.toString());

    return keysMap;
  }

  // End
}
