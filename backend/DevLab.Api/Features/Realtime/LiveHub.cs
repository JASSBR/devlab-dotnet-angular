using Microsoft.AspNetCore.SignalR;

namespace DevLab.Api.Features.Realtime;

/// <summary>
/// Strongly-typed hub: IClientContract lists what the SERVER can call on clients.
/// Public methods on the hub are what CLIENTS can invoke.
/// </summary>
public interface ILiveClient
{
    Task Tick(ServerTick tick);
    Task ChatMessage(ChatMessage message);
    Task Presence(int connectedClients);
}

public record ServerTick(DateTimeOffset At, long RequestsServed, double CpuLoadPercent, int ConnectedClients);
public record ChatMessage(string From, string Text, DateTimeOffset At);

public sealed class LiveHub : Hub<ILiveClient>
{
    private static int _connectedClients;
    public static int ConnectedClients => Volatile.Read(ref _connectedClients); // Interlocked below → safe across connections

    public override async Task OnConnectedAsync()
    {
        Interlocked.Increment(ref _connectedClients);
        await Clients.All.Presence(ConnectedClients);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        Interlocked.Decrement(ref _connectedClients);
        await Clients.All.Presence(ConnectedClients);
        await base.OnDisconnectedAsync(exception);
    }

    // Invoked from Angular: connection.invoke('SendMessage', from, text)
    public Task SendMessage(string from, string text) =>
        Clients.All.ChatMessage(new ChatMessage(from, text, DateTimeOffset.UtcNow));

    // Groups: only members receive. Angular: connection.invoke('JoinRoom', 'vip')
    public Task JoinRoom(string room) => Groups.AddToGroupAsync(Context.ConnectionId, room);
}
