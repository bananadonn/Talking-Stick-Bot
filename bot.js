const { Client, GatewayIntentBits, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Store active sessions
const activeSessions = new Map();
const pendingRequests = new Map();

client.once('clientReady', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Command: !requeststick <duration_in_minutes>
  if (message.content.startsWith('!requeststick')) {
    const args = message.content.split(' ');
    const duration = parseInt(args[1]);

    // Validate duration
    if (!duration || duration < 1 || duration > 120) {
      return message.reply('⚠️ Please provide a valid duration (1-120 minutes).\nUsage: `!requeststick <minutes>`');
    }

    // Check if user has the Stick Holder role
    const hasRole = message.member.roles.cache.some(role => role.name === config.stickHolderRole);
    if (!hasRole) {
      return message.reply(`❌ You need the **${config.stickHolderRole}** role to request a stick session.`);
    }

    // Check if user is in a voice channel
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply('❌ You must be in a voice channel to request a stick session.');
    }

    // Check if user already has an active session
    if (activeSessions.has(message.author.id)) {
      return message.reply('⚠️ You already have an active stick session.');
    }

    // Create approval request embed
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('🎤 Stick Session Request')
      .setDescription(`**${message.author}** requests a stick session`)
      .addFields(
        { name: '⏱️ Duration', value: `${duration} minutes`, inline: true },
        { name: '🔊 Voice Channel', value: voiceChannel.name, inline: true }
      )
      .setFooter({ text: 'Admins: Click below to approve or deny' })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('approve_stick')
          .setLabel('✅ Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('deny_stick')
          .setLabel('❌ Deny')
          .setStyle(ButtonStyle.Danger)
      );

    const requestMsg = await message.channel.send({ 
      embeds: [embed], 
      components: [row] 
    });

    pendingRequests.set(requestMsg.id, {
      userId: message.author.id,
      duration: duration,
      channelId: voiceChannel.id,
      requestMessageId: requestMsg.id
    });

    await message.reply('✅ Your request has been sent to admins for approval.');
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  // Handle approval/denial
  if (interaction.customId === 'approve_stick' || interaction.customId === 'deny_stick') {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only administrators can approve/deny requests.', flags: 64 });
    }

    const request = pendingRequests.get(interaction.message.id);
    if (!request) {
      return interaction.reply({ content: '⚠️ This request is no longer valid.', flags: 64 });
    }

    if (interaction.customId === 'deny_stick') {
      const denyEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Request Denied')
        .setDescription(`Denied by ${interaction.user}`)
        .setTimestamp();

      await interaction.update({ 
        embeds: [denyEmbed],
        components: [] 
      });
      pendingRequests.delete(interaction.message.id);
      return;
    }

    // Approve the session
    const stickHolder = await interaction.guild.members.fetch(request.userId);
    const voiceChannel = interaction.guild.channels.cache.get(request.channelId);

    // Verify stick holder is still in voice channel
    if (!stickHolder.voice.channel || stickHolder.voice.channelId !== request.channelId) {
      const expiredEmbed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('⚠️ Request Expired')
        .setDescription('User is no longer in the voice channel.')
        .setTimestamp();

      await interaction.update({ 
        embeds: [expiredEmbed],
        components: [] 
      });
      pendingRequests.delete(interaction.message.id);
      return;
    }

    const endTime = Date.now() + (request.duration * 60 * 1000);
    
    // Create control panel
    const controlEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🎤 Stick Session Active')
      .setDescription(`Managing voice channel: **${voiceChannel.name}**`)
      .addFields(
        { name: '⏰ Session Ends', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true },
        { name: '👤 Stick Holder', value: `${stickHolder}`, inline: true }
      )
      .setFooter({ text: 'Click buttons below to mute/unmute members' })
      .setTimestamp();

    const memberButtons = createMemberButtons(voiceChannel);
    
    if (memberButtons.length === 0) {
      return interaction.reply({ 
        content: '⚠️ No other members in the voice channel to manage.', 
        flags: 64
      });
    }

    const controlMsg = await interaction.channel.send({
      content: `${stickHolder} Your stick session is now active! Use the buttons below to manage the voice channel.`,
      embeds: [controlEmbed],
      components: memberButtons
    });

    activeSessions.set(request.userId, {
      channelId: request.channelId,
      endTime: endTime,
      mutedUsers: new Set(),
      messageId: controlMsg.id,
      channelMessageId: interaction.channel.id,
      adminId: interaction.user.id
    });

    const approvedEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('✅ Request Approved')
      .setDescription(`Approved by ${interaction.user}`)
      .setTimestamp();

    await interaction.update({ 
      embeds: [approvedEmbed],
      components: [] 
    });
    pendingRequests.delete(interaction.message.id);

    // Set timeout to end session
    setTimeout(() => endSession(request.userId, interaction.guild), request.duration * 60 * 1000);
  }

  // Handle mute/unmute buttons
  if (interaction.customId.startsWith('mute_') || interaction.customId.startsWith('unmute_')) {
    const session = activeSessions.get(interaction.user.id);
    
    if (!session) {
      return interaction.reply({ content: '❌ You do not have an active stick session.', flags: 64 });
    }

    if (Date.now() >= session.endTime) {
      await endSession(interaction.user.id, interaction.guild);
      return interaction.reply({ content: '⏰ Your session has expired.', flags: 64 });
    }

    const targetUserId = interaction.customId.split('_')[1];
    const member = await interaction.guild.members.fetch(targetUserId);

    if (!member.voice.channelId || member.voice.channelId !== session.channelId) {
      return interaction.reply({ content: '⚠️ This user is no longer in the voice channel.', flags: 64 });
    }

    try {
      if (interaction.customId.startsWith('mute_')) {
        await member.voice.setMute(true);
        session.mutedUsers.add(targetUserId);
      } else {
        await member.voice.setMute(false);
        session.mutedUsers.delete(targetUserId);
      }

      const voiceChannel = interaction.guild.channels.cache.get(session.channelId);
      await interaction.update({ components: createMemberButtons(voiceChannel, session.mutedUsers) });
    } catch (err) {
      console.error('Error muting/unmuting:', err);
      await interaction.reply({ content: '❌ Failed to mute/unmute user. Check bot permissions.', flags: 64 });
    }
  }
});

function createMemberButtons(voiceChannel, mutedUsers = new Set()) {
  const members = voiceChannel.members.filter(m => !m.user.bot);
  const buttons = members.map(member => {
    const isMuted = mutedUsers.has(member.id);
    return new ButtonBuilder()
      .setCustomId(isMuted ? `unmute_${member.id}` : `mute_${member.id}`)
      .setLabel(`${isMuted ? '🔇' : '🔊'} - ${member.displayName}`)
      .setStyle(isMuted ? ButtonStyle.Danger : ButtonStyle.Success);
  });

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  return rows.slice(0, 5); // Discord allows max 5 action rows
}

async function endSession(userId, guild) {
  const session = activeSessions.get(userId);
  if (!session) return;

  console.log(`⏰ Ending stick session for user ${userId}`);

  // Unmute all users
  for (const mutedUserId of session.mutedUsers) {
    try {
      const member = await guild.members.fetch(mutedUserId);
      if (member.voice.channelId === session.channelId) {
        await member.voice.setMute(false);
        console.log(`🔊 Unmuted ${member.displayName}`);
      }
    } catch (err) {
      console.error(`Failed to unmute ${mutedUserId}:`, err);
    }
  }

  // Update control panel
  try {
    const channel = guild.channels.cache.get(session.channelMessageId);
    if (channel) {
      const msg = await channel.messages.fetch(session.messageId);
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🎤 Stick Session Ended')
        .setDescription('The session has concluded. All users have been unmuted.')
        .setTimestamp();
      
      await msg.edit({ embeds: [embed], components: [] });
    }
  } catch (err) {
    console.error('Failed to update control panel:', err);
  }

  activeSessions.delete(userId);
  console.log(`✅ Session cleanup complete for user ${userId}`);
}

// Handle errors
client.on('error', error => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// Login with your bot token
client.login(config.token).catch(err => {
  console.error('❌ Failed to login:', err);
  process.exit(1);
});