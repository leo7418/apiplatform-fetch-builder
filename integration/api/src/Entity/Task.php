<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\Put;
use ApiPlatform\Serializer\Filter\PropertyFilter;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Validator\Constraints as Assert;

// API Platform 4 and later only expose PUT when it is declared.
#[ORM\Entity]
#[ApiResource(operations: [new GetCollection(), new Post(), new Get(), new Put(), new Patch(), new Delete()])]
#[ApiFilter(PropertyFilter::class)]
class Task
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column]
    #[Assert\NotBlank]
    public string $title = '';

    #[ORM\Column]
    public string $status = 'todo';

    #[ORM\Column(nullable: true)]
    public ?string $note = null;

    #[ORM\ManyToOne]
    public ?User $assignee = null;

    public function getId(): ?int
    {
        return $this->id;
    }
}
