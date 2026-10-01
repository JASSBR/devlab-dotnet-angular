using DevLab.Api.Features.Greetings;
using Microsoft.AspNetCore.Mvc;

namespace DevLab.Api.Controllers;

/// <summary>
/// MVC Controller style: attribute routing, model binding, filters, action results.
/// Same behaviour as the minimal endpoint — pick one style per project and stick to it.
/// </summary>
[ApiController]
[Route("api/greet/controller")]
[Tags("Greetings")]
public class GreetingsController(TimeProvider clock) : ControllerBase
{
    [HttpGet("{name}")]
    [ProducesResponseType<Greeting>(StatusCodes.Status200OK)]
    public ActionResult<Greeting> Get(string name, [FromQuery] string? lang)
    {
        var hello = lang == "fr" ? "Bonjour" : "Hello";
        return Ok(new Greeting($"{hello}, {name}!", "controller", clock.GetUtcNow()));
    }
}
